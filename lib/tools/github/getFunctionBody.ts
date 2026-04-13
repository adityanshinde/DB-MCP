import * as ts from 'typescript';

import { getFileContent } from '@/lib/tools/github/getFileContent';
import { resolveGitHubRepositoryContext } from '@/lib/tools/github/repoResolver';
import { logMcpError, logMcpEvent } from '@/lib/runtime/observability';
import { normalizeGitHubBranch, normalizeGitHubPath } from '@/lib/validators/githubValidator';
import type { ToolResponse } from '@/lib/types';

type GitHubFunctionBodyInput = {
  org?: string;
  repo?: string;
  path: string;
  branch?: string;
  function_name: string;
  max_matches?: number;
};

type FunctionBodyMatch = {
  kind: 'function_declaration' | 'method' | 'getter' | 'setter' | 'variable_function' | 'property_function';
  name: string;
  start_line: number;
  end_line: number;
  body: string;
  body_line_count: number;
};

type FunctionBodyResult = {
  repo: string;
  branch: string;
  path: string;
  function_name: string;
  total_matches: number;
  returned_matches: number;
  truncated: boolean;
  matches: FunctionBodyMatch[];
};

const DEFAULT_MAX_MATCHES = 1;
const MAX_MATCHES = 5;

function getScriptKind(path: string): ts.ScriptKind {
  const extension = path.toLowerCase().split('.').pop() || '';

  switch (extension) {
    case 'ts':
      return ts.ScriptKind.TS;
    case 'tsx':
      return ts.ScriptKind.TSX;
    case 'js':
    case 'mjs':
    case 'cjs':
      return ts.ScriptKind.JS;
    case 'jsx':
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.TS;
  }
}

function getNameText(name: ts.PropertyName | ts.BindingName | ts.Identifier | undefined): string | null {
  if (!name) {
    return null;
  }

  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function toLineNumber(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function collectFunctionMatches(sourceFile: ts.SourceFile, functionName: string): Array<{ kind: FunctionBodyMatch['kind']; start: number; end: number; name: string }> {
  const matches: Array<{ kind: FunctionBodyMatch['kind']; start: number; end: number; name: string }> = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      matches.push({
        kind: 'function_declaration',
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        name: node.name.text
      });
    } else if (ts.isMethodDeclaration(node)) {
      const name = getNameText(node.name);
      if (name === functionName) {
        matches.push({
          kind: 'method',
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          name
        });
      }
    } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      const name = getNameText(node.name);
      if (name === functionName) {
        matches.push({
          kind: ts.isGetAccessorDeclaration(node) ? 'getter' : 'setter',
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          name
        });
      }
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const name = getNameText(declaration.name);
        if (!name || name !== functionName || !declaration.initializer) {
          continue;
        }

        if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
          matches.push({
            kind: 'variable_function',
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            name
          });
        }
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = getNameText(node.name);
      if (name === functionName && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        matches.push({
          kind: 'property_function',
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          name
        });
      }
    } else if (ts.isPropertyDeclaration(node)) {
      const name = getNameText(node.name);
      if (name === functionName && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        matches.push({
          kind: 'property_function',
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          name
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

function buildMatches(content: string, sourceFile: ts.SourceFile, candidates: Array<{ kind: FunctionBodyMatch['kind']; start: number; end: number; name: string }>, maxMatches: number): FunctionBodyMatch[] {
  const uniqueMatches = new Map<string, FunctionBodyMatch>();

  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.start}:${candidate.end}`;
    if (uniqueMatches.has(key)) {
      continue;
    }

    const body = content.slice(candidate.start, candidate.end).trimEnd();
    uniqueMatches.set(key, {
      kind: candidate.kind,
      name: candidate.name,
      start_line: toLineNumber(sourceFile, candidate.start),
      end_line: toLineNumber(sourceFile, Math.max(candidate.start, candidate.end - 1)),
      body,
      body_line_count: countLines(body)
    });
  }

  return Array.from(uniqueMatches.values()).slice(0, maxMatches);
}

async function loadFunctionBody(input: GitHubFunctionBodyInput): Promise<FunctionBodyResult> {
  const resolvedRepo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
  const normalizedPath = normalizeGitHubPath(input.path);
  const normalizedBranch = normalizeGitHubBranch(input.branch);
  const fileResult = await getFileContent(input.repo, normalizedPath, normalizedBranch, input.org);

  if (!fileResult.success || !fileResult.data) {
    throw new Error(fileResult.error || 'Failed to fetch file content.');
  }

  const functionName = input.function_name.trim();
  if (!functionName) {
    throw new Error('function_name is required.');
  }

  const maxMatches = Math.max(1, Math.min(MAX_MATCHES, input.max_matches ?? DEFAULT_MAX_MATCHES));
  const sourceFile = ts.createSourceFile(normalizedPath, fileResult.data.content, ts.ScriptTarget.Latest, true, getScriptKind(normalizedPath));
  const candidates = collectFunctionMatches(sourceFile, functionName);
  const matches = buildMatches(fileResult.data.content, sourceFile, candidates, maxMatches);

  return {
    repo: resolvedRepo.fullName,
    branch: fileResult.data.branch,
    path: fileResult.data.path,
    function_name: functionName,
    total_matches: candidates.length,
    returned_matches: matches.length,
    truncated: candidates.length > matches.length,
    matches
  };
}

export async function getFunctionBody(input: GitHubFunctionBodyInput): Promise<ToolResponse<FunctionBodyResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.get_function_body', repo: input.repo, org: input.org });

  try {
    const result = await loadFunctionBody(input);

    return {
      success: true,
      data: result,
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.get_function_body', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to extract function body.'
    };
  }
}
