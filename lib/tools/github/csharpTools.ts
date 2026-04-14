import { CONFIG } from '@/lib/config';
import { posix as pathPosix } from 'node:path';
import { getGitHubContent, getGitHubRepositoryContext, searchGitHubCode, type GitHubRepoContext } from '@/lib/tools/github/githubClient';
import { getRepoTree } from '@/lib/tools/github/getRepoTree';
import { getFileContent } from '@/lib/tools/github/getFileContent';
import { resolveGitHubRepositoryContext } from '@/lib/tools/github/repoResolver';
import { logMcpError, logMcpEvent } from '@/lib/runtime/observability';
import { clampGitHubLimit, normalizeGitHubBranch, normalizeGitHubPath } from '@/lib/validators/githubValidator';
import type { GitHubDependencyPathInput, GitHubMigrationStatusInput, GitHubProjectReferencesInput, GitHubTraceCallChainInput, ToolResponse } from '@/lib/types';

type GitHubRepoInput = {
  org?: string;
  repo?: string;
  branch?: string;
};

type SearchFilesInput = GitHubRepoInput & {
  query: string;
  path?: string;
  glob?: string;
  limit?: number;
};

type SymbolSearchInput = GitHubRepoInput & {
  symbol: string;
  kind?: 'class' | 'interface' | 'method' | 'property' | 'field' | 'namespace';
  limit?: number;
};

type ReadLinesInput = GitHubRepoInput & {
  path: string;
  start: number;
  end: number;
};

type MemberDefinitionInput = GitHubRepoInput & {
  path?: string;
  class_name?: string;
  name: string;
  limit?: number;
};

type DefinitionMatch = {
  path: string;
  kind: string;
  name: string;
  class_name?: string;
  start_line: number;
  end_line: number;
  definition: string;
};

type DefinitionResult = {
  repo: string;
  branch: string;
  target: string;
  total_matches: number;
  returned_matches: number;
  truncated: boolean;
  matches: DefinitionMatch[];
};

type SearchFilesResult = {
  repo: string;
  branch: string;
  query: string;
  path: string | null;
  glob: string | null;
  total_count: number;
  returned_count: number;
  truncated: boolean;
  matches: Array<{
    path: string;
    name: string;
    type: 'file' | 'dir' | 'symlink' | 'submodule';
    depth: number;
    html_url: string | null;
  }>;
};

type SearchSymbolsResult = Awaited<ReturnType<typeof searchGitHubCode>>;

type ReadLinesResult = {
  repo: string;
  branch: string;
  path: string;
  start: number;
  end: number;
  total_lines: number;
  returned_lines: number;
  truncated: boolean;
  lines: Array<{
    line_number: number;
    text: string;
  }>;
};

type MemberCallResult = {
  repo: string;
  branch: string;
  name: string;
  kind: string;
  total_count: number;
  returned_count: number;
  truncated: boolean;
  matches: Array<{
    path: string;
    line: number;
    snippet: string;
  }>;
};

type GitHubFileContentData = NonNullable<Awaited<ReturnType<typeof getFileContent>>['data']>;

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.trim().replace(/\\/g, '/');
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/::DOUBLE_STAR::/g, '.*');

  return new RegExp(`^${escaped}$`, 'i');
}

function isCSharpFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.cs') || lower.endsWith('.csproj') || lower.endsWith('.sln');
}

function getLineOffsets(text: string): number[] {
  const offsets = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function getLineNumberForOffset(offsets: number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] <= offset) {
      if (middle === offsets.length - 1 || offsets[middle + 1] > offset) {
        return middle + 1;
      }
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return 1;
}

function getLineAtOffset(text: string, offsets: number[], lineNumber: number): string {
  const start = offsets[lineNumber - 1] ?? 0;
  const end = offsets[lineNumber] ?? text.length;
  return text.slice(start, end).replace(/\r?\n$/, '');
}

function buildMatchText(text: string, startOffset: number, endOffset: number, offsets: number[]): { definition: string; start_line: number; end_line: number } {
  return {
    definition: text.slice(startOffset, endOffset).trimEnd(),
    start_line: getLineNumberForOffset(offsets, startOffset),
    end_line: getLineNumberForOffset(offsets, Math.max(startOffset, endOffset - 1))
  };
}

function findMatchingBrace(text: string, openBraceIndex: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingle) {
      if (char === '\\') {
        index += 1;
        continue;
      }

      if (char === '\'') {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (char === '\\') {
        index += 1;
        continue;
      }

      if (char === '"') {
        inDouble = false;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'') {
      inSingle = true;
      continue;
    }

    if (char === '"') {
      inDouble = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractDelimitedBlock(text: string, startOffset: number): { block: string; endOffset: number } | null {
  const tail = text.slice(startOffset);
  const braceIndex = tail.indexOf('{');
  const arrowIndex = tail.indexOf('=>');
  const semicolonIndex = tail.indexOf(';');

  if (braceIndex >= 0 && (arrowIndex < 0 || braceIndex < arrowIndex)) {
    const openBraceIndex = startOffset + braceIndex;
    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex >= 0) {
      return {
        block: text.slice(startOffset, closeBraceIndex + 1).trimEnd(),
        endOffset: closeBraceIndex + 1
      };
    }
  }

  if (arrowIndex >= 0 && (semicolonIndex < 0 || arrowIndex < semicolonIndex)) {
    const endOffset = startOffset + semicolonIndex + 1;
    return {
      block: text.slice(startOffset, endOffset).trimEnd(),
      endOffset
    };
  }

  if (semicolonIndex >= 0) {
    const endOffset = startOffset + semicolonIndex + 1;
    return {
      block: text.slice(startOffset, endOffset).trimEnd(),
      endOffset
    };
  }

  return null;
}

function getMatchingLineIndices(lines: string[], pattern: RegExp): number[] {
  const indices: number[] = [];
  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      indices.push(index);
    }
  });
  return indices;
}

function buildClassPattern(name: string): RegExp {
  return new RegExp(`^\\s*(?:\\[[^\\]]+\\]\\s*)*(?:public|private|protected|internal|abstract|sealed|static|partial|new|unsafe|readonly|file|\\s)*(?:record\\s+)?class\\s+${escapeRegExp(name)}\\b`);
}

function buildAnyClassPattern(): RegExp {
  return /^\s*(?:\[[^\]]+\]\s*)*(?:public|private|protected|internal|abstract|sealed|static|partial|new|unsafe|readonly|file|\s)*(?:record\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
}

function buildInterfacePattern(name: string): RegExp {
  return new RegExp(`^\\s*(?:\\[[^\\]]+\\]\\s*)*(?:public|private|protected|internal|abstract|sealed|static|partial|new|unsafe|readonly|file|\\s)*interface\\s+${escapeRegExp(name)}\\b`);
}

function buildMethodPattern(name: string): RegExp {
  return new RegExp(
    `^\\s*(?:\\[[^\\]]+\\]\\s*)*(?:public|private|protected|internal|static|virtual|override|async|sealed|extern|partial|new|unsafe|abstract|readonly|ref|async|virtual|\\s)*[\\w<>,\\[\\]\\?.]+\\s+${escapeRegExp(name)}\\s*\\(`
  );
}

function buildConstructorPattern(name: string): RegExp {
  return new RegExp(`^\\s*(?:\\[[^\\]]+\\]\\s*)*(?:public|private|protected|internal|static|partial|\\s)*${escapeRegExp(name)}\\s*\\(`);
}

function findBlockInFile(text: string, targetPattern: RegExp): Array<{ startOffset: number; endOffset: number; lineNumber: number }> {
  const offsets = getLineOffsets(text);
  const lines = text.split(/\r?\n/);
  const matches = getMatchingLineIndices(lines, targetPattern);
  const blocks: Array<{ startOffset: number; endOffset: number; lineNumber: number }> = [];

  for (const lineIndex of matches) {
    const startOffset = offsets[lineIndex] ?? 0;
    const extracted = extractDelimitedBlock(text, startOffset);
    if (extracted) {
      blocks.push({
        startOffset,
        endOffset: extracted.endOffset,
        lineNumber: lineIndex + 1
      });
    }
  }

  return blocks;
}

async function resolveRepoContext(input: GitHubRepoInput): Promise<{ repoContext: GitHubRepoContext; resolvedBranch: string; resolvedRepo: { org: string; repo: string; fullName: string } }> {
  const resolvedRepo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
  const repoContext = await getGitHubRepositoryContext(resolvedRepo.fullName, input.branch);
  const resolvedBranch = normalizeGitHubBranch(input.branch) || repoContext.resolvedBranch;
  return { repoContext, resolvedBranch, resolvedRepo };
}

async function loadRepoTreeEntries(input: GitHubRepoInput, path?: string, depth?: number) {
  const { resolvedRepo, resolvedBranch } = await resolveRepoContext(input);
  const tree = await getRepoTree(resolvedRepo.repo, path, resolvedBranch, depth ?? CONFIG.github.treeMaxDepth, resolvedRepo.org);
  if (!tree.success || !tree.data) {
    throw new Error(tree.error || 'Failed to fetch repository tree.');
  }

  return { resolvedRepo, resolvedBranch, data: tree.data };
}

export async function searchFiles(input: SearchFilesInput): Promise<ToolResponse<SearchFilesResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.search_files', repo: input.repo, org: input.org });

  try {
    const query = input.query.trim();
    if (!query) {
      throw new Error('query is required.');
    }

    const limit = clampGitHubLimit(input.limit, 1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT);
    const pathFilter = input.path ? normalizeGitHubPath(input.path) : null;
    const globFilter = input.glob ? globToRegExp(input.glob) : null;
    const { resolvedRepo, resolvedBranch, data } = await loadRepoTreeEntries(input, pathFilter || undefined);
    const matches = data.entries.filter((entry) => {
      if (entry.type !== 'file') {
        return false;
      }

      if (pathFilter && !entry.path.toLowerCase().startsWith(pathFilter.toLowerCase())) {
        return false;
      }

      if (globFilter && !globFilter.test(entry.path)) {
        return false;
      }

      return entry.path.toLowerCase().includes(query.toLowerCase()) || entry.name.toLowerCase().includes(query.toLowerCase());
    });

    const sliced = matches.slice(0, limit).map((entry) => ({
      path: entry.path,
      name: entry.name,
      type: entry.type,
      depth: entry.depth,
      html_url: entry.html_url ?? null
    }));

    return {
      success: true,
      data: {
        repo: resolvedRepo.repo,
        branch: resolvedBranch,
        query,
        path: pathFilter,
        glob: input.glob?.trim() || null,
        total_count: matches.length,
        returned_count: sliced.length,
        truncated: matches.length > sliced.length,
        matches: sliced
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.search_files', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to search files.'
    };
  }
}

export async function searchSymbols(input: SymbolSearchInput): Promise<ToolResponse<SearchSymbolsResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.search_symbols', repo: input.repo, org: input.org });

  try {
    const query = input.symbol.trim();
    if (!query) {
      throw new Error('symbol is required.');
    }

    const limit = clampGitHubLimit(input.limit, 1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT);
    const repo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
    const repoContext = await getGitHubRepositoryContext(repo.fullName, input.branch);
    const csharpLanguage = 'C#';
    const searchQuery = input.kind ? `${input.kind} ${query}` : query;
    const data = await searchGitHubCode(repoContext, searchQuery, {
      limit,
      language: csharpLanguage
    });

    return {
      success: true,
      data,
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.search_symbols', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to search symbols.'
    };
  }
}

export async function findReferences(input: SymbolSearchInput): Promise<ToolResponse<SearchSymbolsResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.find_references', repo: input.repo, org: input.org });

  try {
    const query = input.symbol.trim();
    if (!query) {
      throw new Error('symbol is required.');
    }

    const limit = clampGitHubLimit(input.limit, 1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT);
    const repo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
    const repoContext = await getGitHubRepositoryContext(repo.fullName, input.branch);
    const data = await searchGitHubCode(repoContext, query, {
      limit,
      language: 'C#'
    });

    return {
      success: true,
      data,
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.find_references', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to find references.'
    };
  }
}

async function loadFileText(input: GitHubRepoInput & { path: string }): Promise<{ resolvedRepo: { org: string; repo: string; fullName: string }; resolvedBranch: string; file: GitHubFileContentData }> {
  const resolvedRepo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
  const file = await getFileContent(input.repo, input.path, input.branch, input.org);

  if (!file.success || !file.data) {
    throw new Error(file.error || 'Failed to fetch file content.');
  }

  const repoContext = await getGitHubRepositoryContext(resolvedRepo.fullName, input.branch);
  return {
    resolvedRepo,
    resolvedBranch: normalizeGitHubBranch(input.branch) || repoContext.resolvedBranch,
    file: file.data
  };
}

function extractDefinitionsFromText(text: string, targetName: string, className?: string): Array<{ startOffset: number; endOffset: number; kind: string; name: string; class_name?: string }> {
  const offsets = getLineOffsets(text);
  const lines = text.split(/\r?\n/);
  const results: Array<{ startOffset: number; endOffset: number; kind: string; name: string; class_name?: string }> = [];

  const classPattern = className ? buildClassPattern(className) : null;
  const methodPattern = buildMethodPattern(targetName);
  const ctorPattern = className ? buildConstructorPattern(className) : null;

  let currentClass: string | undefined;
  let currentClassDepth = 0;
  let braceDepth = 0;
  const anyClassPattern = buildAnyClassPattern();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const classMatch = classPattern?.test(line) ?? false;
    const anyClassMatch = anyClassPattern.test(line);

    if (classMatch) {
      currentClass = className;
      currentClassDepth = braceDepth;
    } else if (anyClassMatch && !currentClass) {
      const match = /class\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
      if (match) {
        currentClass = match[1];
        currentClassDepth = braceDepth;
      }
    }

    if (className && currentClass && currentClass !== className && braceDepth < currentClassDepth) {
      currentClass = undefined;
    }

    const methodMatched = methodPattern.test(line) || (ctorPattern?.test(line) ?? false);
    if (methodMatched && (!className || currentClass === className || line.includes(className))) {
      const startOffset = offsets[lineIndex] ?? 0;
      const block = extractDelimitedBlock(text, startOffset);
      if (block) {
        results.push({
          startOffset,
          endOffset: block.endOffset,
          kind: methodPattern.test(line) ? 'method' : 'constructor',
          name: targetName,
          class_name: currentClass
        });
      }
    }

    for (const char of line) {
      if (char === '{') {
        braceDepth += 1;
      } else if (char === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }
  }

  return results;
}

async function searchDefinitions(input: MemberDefinitionInput, targetName: string, targetKind: 'method' | 'class'): Promise<ToolResponse<DefinitionResult>> {
  const resolved = await loadFileText({ org: input.org, repo: input.repo, path: input.path ?? '', branch: input.branch });
  const text = resolved.file.content;
  const matches = targetKind === 'class'
    ? extractDefinitionsFromText(text, targetName, input.class_name)
    : extractDefinitionsFromText(text, targetName, input.class_name);

  const limited = matches.slice(0, clampGitHubLimit(input.limit, 1, 20, 5)).map((match) => {
    const offsets = getLineOffsets(text);
    const textSlice = text.slice(match.startOffset, match.endOffset).trimEnd();
    return {
      path: resolved.file.path,
      kind: match.kind,
      name: match.name,
      class_name: match.class_name,
      start_line: getLineNumberForOffset(offsets, match.startOffset),
      end_line: getLineNumberForOffset(offsets, Math.max(match.startOffset, match.endOffset - 1)),
      definition: textSlice
    };
  });

  return {
    success: true,
    data: {
      repo: resolved.resolvedRepo.fullName,
      branch: resolved.resolvedBranch,
      target: targetName,
      total_matches: matches.length,
      returned_matches: limited.length,
      truncated: matches.length > limited.length,
      matches: limited
    },
    error: null
  };
}

export async function getMethodDefinition(input: MemberDefinitionInput): Promise<ToolResponse<DefinitionResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.get_method_definition', repo: input.repo, org: input.org });

  try {
    const target = input.name.trim();
    if (!target) {
      throw new Error('name is required.');
    }

    if (input.path) {
      return await searchDefinitions(input, target, 'method');
    }

    const search = await searchSymbols({
      org: input.org,
      repo: input.repo,
      branch: input.branch,
      symbol: target,
      kind: 'method',
      limit: input.limit ?? 5
    });

    if (!search.success || !search.data) {
      throw new Error(search.error || 'Failed to search for method definition.');
    }

    const uniquePaths = Array.from(new Set(search.data.results.map((item) => item.path)));
    const matches: DefinitionMatch[] = [];

    for (const path of uniquePaths) {
      const fileResult = await loadFileText({ org: input.org, repo: input.repo, path, branch: input.branch });
      const text = fileResult.file.content;
      const extracted = extractDefinitionsFromText(text, target, input.class_name);
      const offsets = getLineOffsets(text);

      for (const item of extracted) {
        if (matches.length >= clampGitHubLimit(input.limit, 1, 20, 5)) {
          break;
        }

        matches.push({
          path,
          kind: item.kind,
          name: item.name,
          class_name: item.class_name,
          start_line: getLineNumberForOffset(offsets, item.startOffset),
          end_line: getLineNumberForOffset(offsets, Math.max(item.startOffset, item.endOffset - 1)),
          definition: text.slice(item.startOffset, item.endOffset).trimEnd()
        });
      }

      if (matches.length >= clampGitHubLimit(input.limit, 1, 20, 5)) {
        break;
      }
    }

    return {
      success: true,
      data: {
        repo: search.data.repo,
        branch: search.data.branch,
        target,
        total_matches: search.data.total_count,
        returned_matches: matches.length,
        truncated: search.data.limited || search.data.total_count > matches.length,
        matches
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.get_method_definition', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get method definition.'
    };
  }
}

export async function getClassDefinition(input: MemberDefinitionInput): Promise<ToolResponse<DefinitionResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.get_class_definition', repo: input.repo, org: input.org });

  try {
    const target = input.name.trim();
    if (!target) {
      throw new Error('name is required.');
    }

    const search = input.path
      ? await loadFileText({ org: input.org, repo: input.repo, path: input.path, branch: input.branch })
      : null;

    if (search) {
      const text = search.file.content;
      const pattern = buildClassPattern(target);
      const offsets = getLineOffsets(text);
      const lines = text.split(/\r?\n/);
      const matches = getMatchingLineIndices(lines, pattern).map((lineIndex) => {
        const startOffset = offsets[lineIndex] ?? 0;
        const block = extractDelimitedBlock(text, startOffset);
        if (!block) {
          return null;
        }

        return {
          path: search.file.path,
          kind: 'class',
          name: target,
          start_line: lineIndex + 1,
          end_line: getLineNumberForOffset(offsets, block.endOffset - 1),
          definition: text.slice(startOffset, block.endOffset).trimEnd()
        };
      }).filter(Boolean) as DefinitionMatch[];

      return {
        success: true,
        data: {
          repo: search.resolvedRepo.fullName,
          branch: search.resolvedBranch,
          target,
          total_matches: matches.length,
          returned_matches: matches.length,
          truncated: false,
          matches
        },
        error: null
      };
    }

    const symbolSearch = await searchSymbols({
      org: input.org,
      repo: input.repo,
      branch: input.branch,
      symbol: target,
      kind: 'class',
      limit: input.limit ?? 5
    });

    if (!symbolSearch.success || !symbolSearch.data) {
      throw new Error(symbolSearch.error || 'Failed to search for class definition.');
    }

    const uniquePaths = Array.from(new Set(symbolSearch.data.results.map((item) => item.path)));
    const matches: DefinitionMatch[] = [];

    for (const path of uniquePaths) {
      const fileResult = await loadFileText({ org: input.org, repo: input.repo, path, branch: input.branch });
      const text = fileResult.file.content;
      const offsets = getLineOffsets(text);
      const lines = text.split(/\r?\n/);
      const lineIndices = getMatchingLineIndices(lines, buildClassPattern(target));

      for (const lineIndex of lineIndices) {
        if (matches.length >= clampGitHubLimit(input.limit, 1, 20, 5)) {
          break;
        }

        const startOffset = offsets[lineIndex] ?? 0;
        const block = extractDelimitedBlock(text, startOffset);
        if (!block) {
          continue;
        }

        matches.push({
          path,
          kind: 'class',
          name: target,
          start_line: lineIndex + 1,
          end_line: getLineNumberForOffset(offsets, block.endOffset - 1),
          definition: text.slice(startOffset, block.endOffset).trimEnd()
        });
      }

      if (matches.length >= clampGitHubLimit(input.limit, 1, 20, 5)) {
        break;
      }
    }

    return {
      success: true,
      data: {
        repo: symbolSearch.data.repo,
        branch: symbolSearch.data.branch,
        target,
        total_matches: symbolSearch.data.total_count,
        returned_matches: matches.length,
        truncated: symbolSearch.data.limited || symbolSearch.data.total_count > matches.length,
        matches
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.get_class_definition', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get class definition.'
    };
  }
}

export async function getInterfaceImplementations(input: SymbolSearchInput): Promise<ToolResponse<DefinitionResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.get_interface_implementations', repo: input.repo, org: input.org });

  try {
    const interfaceName = input.symbol.trim();
    if (!interfaceName) {
      throw new Error('symbol is required.');
    }

    const search = await searchSymbols({
      org: input.org,
      repo: input.repo,
      branch: input.branch,
      symbol: interfaceName,
      kind: 'interface',
      limit: input.limit ?? 10
    });

    if (!search.success || !search.data) {
      throw new Error(search.error || 'Failed to search for interface implementations.');
    }

    const implementationPattern = new RegExp(`:\\s*[^\\{\\n]*\\b${escapeRegExp(interfaceName)}\\b`);
    const matches: DefinitionMatch[] = [];

    for (const result of search.data.results) {
      if (!implementationPattern.test(result.snippets.join('\n')) && !implementationPattern.test(result.path)) {
        continue;
      }

      matches.push({
        path: result.path,
        kind: 'implementation',
        name: interfaceName,
        start_line: 1,
        end_line: 1,
        definition: result.snippets.join('\n')
      });

      if (matches.length >= clampGitHubLimit(input.limit, 1, 20, 10)) {
        break;
      }
    }

    return {
      success: true,
      data: {
        repo: search.data.repo,
        branch: search.data.branch,
        target: interfaceName,
        total_matches: search.data.total_count,
        returned_matches: matches.length,
        truncated: search.data.limited || search.data.total_count > matches.length,
        matches
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.get_interface_implementations', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to find interface implementations.'
    };
  }
}

export async function getMethodCallers(input: MemberDefinitionInput): Promise<ToolResponse<MemberCallResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.get_method_callers', repo: input.repo, org: input.org });

  try {
    const methodName = input.name.trim();
    if (!methodName) {
      throw new Error('name is required.');
    }

    const search = await searchSymbols({
      org: input.org,
      repo: input.repo,
      branch: input.branch,
      symbol: methodName,
      kind: 'method',
      limit: input.limit ?? 10
    });

    if (!search.success || !search.data) {
      throw new Error(search.error || 'Failed to search for method callers.');
    }

    const matches = search.data.results.map((result) => ({
      path: result.path,
      line: 1,
      snippet: result.snippets[0] || result.path
    })).slice(0, clampGitHubLimit(input.limit, 1, 20, 10));

    return {
      success: true,
      data: {
        repo: search.data.repo,
        branch: search.data.branch,
        name: methodName,
        kind: 'callers',
        total_count: search.data.total_count,
        returned_count: matches.length,
        truncated: search.data.limited || search.data.total_count > matches.length,
        matches
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.get_method_callers', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get method callers.'
    };
  }
}

export async function getMethodCallees(input: MemberDefinitionInput): Promise<ToolResponse<MemberCallResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.get_method_callees', repo: input.repo, org: input.org });

  try {
    const methodName = input.name.trim();
    if (!methodName) {
      throw new Error('name is required.');
    }

    const definitions = await getMethodDefinition(input);
    if (!definitions.success || !definitions.data || definitions.data.matches.length === 0) {
      throw new Error(definitions.error || 'Failed to resolve method definition.');
    }

    const callPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    const blocked = new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'using', 'return', 'new', 'nameof', 'typeof', 'sizeof', 'lock', 'throw', 'await', 'checked', 'unchecked', 'yield', 'base', 'this']);
    const matches: Array<{ path: string; line: number; snippet: string }> = [];

    for (const definition of definitions.data.matches) {
      const body = definition.definition;
      const seen = new Set<string>();
      let match: RegExpExecArray | null;

      while ((match = callPattern.exec(body)) !== null) {
        const callee = match[1];
        if (callee === methodName || blocked.has(callee.toLowerCase()) || seen.has(callee)) {
          continue;
        }

        seen.add(callee);
        matches.push({
          path: definition.path,
          line: definition.start_line,
          snippet: callee
        });

        if (matches.length >= clampGitHubLimit(input.limit, 1, 20, 10)) {
          break;
        }
      }

      if (matches.length >= clampGitHubLimit(input.limit, 1, 20, 10)) {
        break;
      }
    }

    return {
      success: true,
      data: {
        repo: definitions.data.repo,
        branch: definitions.data.branch,
        name: methodName,
        kind: 'callees',
        total_count: matches.length,
        returned_count: matches.length,
        truncated: false,
        matches
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.get_method_callees', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get method callees.'
    };
  }
}

export async function readLines(input: ReadLinesInput): Promise<ToolResponse<ReadLinesResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.read_lines', repo: input.repo, org: input.org });

  try {
    if (input.start < 1 || input.end < input.start) {
      throw new Error('start and end must form a valid line range.');
    }

    const content = await getFileContent(input.repo, input.path, input.branch, input.org);
    if (!content.success || !content.data) {
      throw new Error(content.error || 'Failed to fetch file content.');
    }

    const lines = content.data.content.split(/\r?\n/);
    const start = Math.max(1, input.start);
    const end = Math.min(lines.length, input.end);
    const sliced = lines.slice(start - 1, end).map((text, index) => ({
      line_number: start + index,
      text
    }));

    return {
      success: true,
      data: {
        repo: content.data.repo,
        branch: content.data.branch,
        path: content.data.path,
        start,
        end,
        total_lines: lines.length,
        returned_lines: sliced.length,
        truncated: end < input.end,
        lines: sliced
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.read_lines', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to read lines.'
    };
  }
}

type ProjectCatalogEntry = {
  path: string;
  name: string;
  kind: 'solution' | 'project';
  project_references: string[];
  package_references: string[];
  target_frameworks: string[];
  indicators: {
    mssql: boolean;
    postgres: boolean;
    data_context: boolean;
  };
};

type ProjectGraphEdge = {
  from: string;
  to: string;
};

type ProjectGraphResult = {
  repo: string;
  branch: string;
  root: string | null;
  project_count: number;
  edge_count: number;
  nodes: ProjectCatalogEntry[];
  edges: ProjectGraphEdge[];
};

type DependencyPathResult = {
  repo: string;
  branch: string;
  from: string;
  to: string;
  found: boolean;
  path: string[];
  edges: ProjectGraphEdge[];
  project_count: number;
};

type UsageMatch = {
  term: string;
  path: string;
  name: string;
  repository: string;
  url: string;
  score: number;
  snippets: string[];
};

type UsageResult = {
  repo: string;
  branch: string;
  query_terms: string[];
  total_count: number;
  returned_count: number;
  truncated: boolean;
  matches: UsageMatch[];
};

type MigrationStatusResult = {
  repo: string;
  branch: string;
  status: 'unknown' | 'mssql_only' | 'postgres_only' | 'mixed' | 'migrating_to_postgres';
  mssql_signals: number;
  postgres_signals: number;
  project_count: number;
  evidence: {
    mssql: UsageResult;
    postgres: UsageResult;
    projects: ProjectCatalogEntry[];
  };
};

type TraceCallChainNode = {
  symbol: string;
  path: string;
  class_name?: string;
  depth: number;
  start_line: number;
  end_line: number;
  calls: string[];
  definition: string;
};

type TraceCallChainResult = {
  repo: string;
  branch: string;
  entry_symbol: string;
  depth_limit: number;
  node_limit: number;
  truncated: boolean;
  nodes: TraceCallChainNode[];
  edges: ProjectGraphEdge[];
};

function normalizeRepoPath(basePath: string, relativePath: string): string {
  const normalized = relativePath.trim().replace(/\\/g, '/');
  if (!normalized) {
    return normalizeGitHubPath(basePath);
  }

  if (normalized.startsWith('/')) {
    return normalizeGitHubPath(normalized);
  }

  const baseDirectory = pathPosix.dirname(normalizeGitHubPath(basePath));
  return normalizeGitHubPath(pathPosix.normalize(pathPosix.join(baseDirectory, normalized)));
}

function parseRepeatedMatches(content: string, pattern: RegExp): string[] {
  const values: string[] = [];
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;

  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) {
      values.push(match[1].trim());
    }
  }

  return Array.from(new Set(values.filter(Boolean)));
}

function parseTargetFrameworks(content: string): string[] {
  const frameworks = new Set<string>();
  const single = /<TargetFramework>([^<]+)<\/TargetFramework>/i.exec(content);
  const multi = /<TargetFrameworks>([^<]+)<\/TargetFrameworks>/i.exec(content);

  for (const value of [single?.[1], multi?.[1]]) {
    if (!value) {
      continue;
    }

    value.split(';').map((item) => item.trim()).filter(Boolean).forEach((item) => frameworks.add(item));
  }

  return Array.from(frameworks);
}

function parseProjectIndicators(content: string, packageReferences: string[]): { mssql: boolean; postgres: boolean; data_context: boolean } {
  const lowerContent = content.toLowerCase();
  const lowerPackages = packageReferences.map((item) => item.toLowerCase());

  return {
    mssql:
      /sqlconnection|sqlcommand|system\.data\.sqlclient|microsoft\.data\.sqlclient|ticklinksdbdatacontext|commandtype\.storedprocedure/.test(lowerContent) ||
      lowerPackages.some((item) => item.includes('sqlclient') || item.includes('entityframework.sqlserver')),
    postgres:
      /npgsqlconnection|npgsqlcommand|npgsqldatasource|npgsqlparameter|using\s+npgsql/.test(lowerContent) ||
      lowerPackages.some((item) => item.includes('npgsql') || item.includes('entityframeworkcore.postgresql')),
    data_context: /ticklinksdbdatacontext|datacontext/i.test(content)
  };
}

function parseSolutionProjects(content: string, solutionPath: string): Array<{ name: string; path: string }> {
  const pattern = /^Project\("\{[^\"]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+)",\s*"\{[^\"]+\}"/gmi;
  const projects: Array<{ name: string; path: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const name = match[1]?.trim();
    const includePath = match[2]?.trim();
    if (name && includePath) {
      projects.push({
        name,
        path: normalizeRepoPath(solutionPath, includePath)
      });
    }
  }

  return projects;
}

function parseCsproj(content: string, path: string): Pick<ProjectCatalogEntry, 'project_references' | 'package_references' | 'target_frameworks' | 'indicators'> {
  const projectReferences = parseRepeatedMatches(content, /<ProjectReference[^>]*Include="([^"]+)"[^>]*>/gi).map((item) => normalizeRepoPath(path, item));
  const packageReferences = parseRepeatedMatches(content, /<PackageReference[^>]*Include="([^"]+)"[^>]*>/gi);
  return {
    project_references: projectReferences,
    package_references: packageReferences,
    target_frameworks: parseTargetFrameworks(content),
    indicators: parseProjectIndicators(content, packageReferences)
  };
}

function resolveProjectIdentifier(identifier: string, projects: ProjectCatalogEntry[]): ProjectCatalogEntry | null {
  const normalized = normalizeGitHubPath(identifier).toLowerCase();
  const baseName = pathPosix.basename(normalized).replace(/\.(csproj|sln)$/i, '').toLowerCase();

  return (
    projects.find((project) => project.path.toLowerCase() === normalized) ||
    projects.find((project) => project.path.toLowerCase().endsWith(`/${normalized}`)) ||
    projects.find((project) => project.name.toLowerCase() === normalized || project.name.toLowerCase() === baseName) ||
    null
  );
}

async function loadProjectCatalog(input: GitHubRepoInput & { root?: string; limit?: number }): Promise<{ resolvedRepo: { org: string; repo: string; fullName: string }; resolvedBranch: string; projects: ProjectCatalogEntry[] }> {
  const resolvedRepo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
  const repoContext = await getGitHubRepositoryContext(resolvedRepo.fullName, input.branch);
  const resolvedBranch = normalizeGitHubBranch(input.branch) || repoContext.resolvedBranch;
  const root = input.root ? normalizeGitHubPath(input.root) : undefined;
  const tree = await getRepoTree(resolvedRepo.repo, root, resolvedBranch, CONFIG.github.treeMaxDepth, resolvedRepo.org);

  if (!tree.success || !tree.data) {
    throw new Error(tree.error || 'Failed to load project catalog.');
  }

  const candidateFiles = tree.data.entries.filter((entry) => entry.type === 'file' && (entry.path.toLowerCase().endsWith('.csproj') || entry.path.toLowerCase().endsWith('.sln')));
  const projects: ProjectCatalogEntry[] = [];

  for (const candidate of candidateFiles) {
    const file = await getFileContent(resolvedRepo.repo, candidate.path, resolvedBranch, resolvedRepo.org);
    if (!file.success || !file.data) {
      continue;
    }

    const content = file.data.content;
    const name = pathPosix.basename(candidate.path).replace(/\.(csproj|sln)$/i, '');

    if (candidate.path.toLowerCase().endsWith('.sln')) {
      const projectReferences = parseSolutionProjects(content, candidate.path).map((item) => item.path);
      projects.push({
        path: candidate.path,
        name,
        kind: 'solution',
        project_references: projectReferences,
        package_references: [],
        target_frameworks: [],
        indicators: parseProjectIndicators(content, [])
      });
      continue;
    }

    const parsed = parseCsproj(content, candidate.path);
    projects.push({
      path: candidate.path,
      name,
      kind: 'project',
      ...parsed
    });
  }

  return {
    resolvedRepo,
    resolvedBranch,
    projects
  };
}

function buildProjectGraph(projects: ProjectCatalogEntry[]): { nodes: ProjectCatalogEntry[]; edges: ProjectGraphEdge[] } {
  const projectMap = new Map(projects.map((project) => [project.path.toLowerCase(), project]));
  const edges: ProjectGraphEdge[] = [];

  for (const project of projects) {
    for (const reference of project.project_references) {
      const resolved = projectMap.get(reference.toLowerCase()) ?? projects.find((candidate) => candidate.path.toLowerCase().endsWith(`/${reference.toLowerCase()}`));
      if (resolved) {
        edges.push({ from: project.path, to: resolved.path });
      }
    }
  }

  return {
    nodes: projects,
    edges
  };
}

function findShortestPath(projects: ProjectCatalogEntry[], edges: ProjectGraphEdge[], from: string, to: string): string[] {
  const start = resolveProjectIdentifier(from, projects);
  const target = resolveProjectIdentifier(to, projects);
  if (!start || !target) {
    return [];
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const current = adjacency.get(edge.from) || [];
    current.push(edge.to);
    adjacency.set(edge.from, current);
  }

  const queue: Array<{ path: string[]; node: string }> = [{ path: [start.path], node: start.path }];
  const visited = new Set<string>([start.path.toLowerCase()]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.node.toLowerCase() === target.path.toLowerCase()) {
      return current.path;
    }

    for (const next of adjacency.get(current.node) || []) {
      const key = next.toLowerCase();
      if (visited.has(key)) {
        continue;
      }

      visited.add(key);
      queue.push({ path: [...current.path, next], node: next });
    }
  }

  return [];
}

function mergeUsageResults(results: Array<{ term: string; data: SearchSymbolsResult }>, limit: number): UsageResult {
  const matches: UsageMatch[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const item of result.data.results) {
      const key = `${item.path}|${item.url}`.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      matches.push({
        term: result.term,
        path: item.path,
        name: item.name,
        repository: item.repository,
        url: item.url,
        score: item.score,
        snippets: item.snippets
      });

      if (matches.length >= limit) {
        break;
      }
    }

    if (matches.length >= limit) {
      break;
    }
  }

  return {
    repo: results[0]?.data.repo || '',
    branch: results[0]?.data.branch || '',
    query_terms: results.map((item) => item.term),
    total_count: matches.length,
    returned_count: matches.length,
    truncated: results.some((item) => item.data.limited) || false,
    matches
  };
}

async function searchUsageTerms(input: GitHubRepoInput, terms: string[], limit = 20): Promise<UsageResult> {
  const repo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
  const repoContext = await getGitHubRepositoryContext(repo.fullName, input.branch);
  const searches: Array<{ term: string; data: SearchSymbolsResult }> = [];

  for (const term of terms) {
    const result = await searchGitHubCode(repoContext, term, {
      limit,
      language: 'C#'
    });
    searches.push({ term, data: result });
  }

  return mergeUsageResults(searches, limit);
}

function detectMigrationStatus(mssqlSignals: number, postgresSignals: number): MigrationStatusResult['status'] {
  if (mssqlSignals === 0 && postgresSignals === 0) {
    return 'unknown';
  }

  if (postgresSignals > 0 && mssqlSignals === 0) {
    return 'postgres_only';
  }

  if (mssqlSignals > 0 && postgresSignals === 0) {
    return 'mssql_only';
  }

  if (postgresSignals > mssqlSignals) {
    return 'migrating_to_postgres';
  }

  return 'mixed';
}

function extractCallNames(text: string): string[] {
  const blocked = new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'using', 'return', 'new', 'nameof', 'typeof', 'sizeof', 'lock', 'throw', 'await', 'checked', 'unchecked', 'yield', 'base', 'this']);
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    if (!blocked.has(name.toLowerCase())) {
      names.add(name);
    }
  }

  return Array.from(names);
}

export async function getProjectReferences(input: GitHubProjectReferencesInput): Promise<ToolResponse<ProjectGraphResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.get_project_references', repo: input.repo, org: input.org });

  try {
    const catalog = await loadProjectCatalog(input);
    const graph = buildProjectGraph(catalog.projects);

    return {
      success: true,
      data: {
        repo: catalog.resolvedRepo.fullName,
        branch: catalog.resolvedBranch,
        root: input.root ? normalizeGitHubPath(input.root) : null,
        project_count: graph.nodes.length,
        edge_count: graph.edges.length,
        nodes: graph.nodes,
        edges: graph.edges
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.get_project_references', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get project references.'
    };
  }
}

export async function getDependencyGraph(input: GitHubProjectReferencesInput): Promise<ToolResponse<ProjectGraphResult>> {
  return getProjectReferences(input);
}

export async function findDependencyPath(input: GitHubDependencyPathInput): Promise<ToolResponse<DependencyPathResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.find_dependency_path', repo: input.repo, org: input.org });

  try {
    const catalog = await loadProjectCatalog(input);
    const graph = buildProjectGraph(catalog.projects);
    const path = findShortestPath(graph.nodes, graph.edges, input.from, input.to);

    return {
      success: true,
      data: {
        repo: catalog.resolvedRepo.fullName,
        branch: catalog.resolvedBranch,
        from: input.from,
        to: input.to,
        found: path.length > 0,
        path,
        edges: graph.edges,
        project_count: graph.nodes.length
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.find_dependency_path', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to find dependency path.'
    };
  }
}

export async function findMssqlUsage(input: GitHubProjectReferencesInput): Promise<ToolResponse<UsageResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.find_mssql_usage', repo: input.repo, org: input.org });

  try {
    const usage = await searchUsageTerms(input, ['SqlConnection', 'SqlCommand', 'System.Data.SqlClient', 'Microsoft.Data.SqlClient', 'TicklinksDBDataContext', 'CommandType.StoredProcedure'], clampGitHubLimit(input.limit, 1, 50, 20));
    return {
      success: true,
      data: usage,
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.find_mssql_usage', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to find MSSQL usage.'
    };
  }
}

export async function findPostgresUsage(input: GitHubProjectReferencesInput): Promise<ToolResponse<UsageResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.find_postgres_usage', repo: input.repo, org: input.org });

  try {
    const usage = await searchUsageTerms(input, ['NpgsqlConnection', 'NpgsqlCommand', 'NpgsqlDataSource', 'NpgsqlParameter', 'using Npgsql'], clampGitHubLimit(input.limit, 1, 50, 20));
    return {
      success: true,
      data: usage,
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.find_postgres_usage', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to find PostgreSQL usage.'
    };
  }
}

export async function classifyMigrationStatus(input: GitHubMigrationStatusInput): Promise<ToolResponse<MigrationStatusResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.classify_migration_status', repo: input.repo, org: input.org });

  try {
    const catalog = await loadProjectCatalog(input);
    const graph = buildProjectGraph(catalog.projects);
    const mssql = await findMssqlUsage({ org: input.org, repo: input.repo, branch: input.branch, root: input.root, limit: input.limit });
    const postgres = await findPostgresUsage({ org: input.org, repo: input.repo, branch: input.branch, root: input.root, limit: input.limit });

    if (!mssql.success || !postgres.success || !mssql.data || !postgres.data) {
      throw new Error(mssql.error || postgres.error || 'Failed to classify migration status.');
    }

    const projectMssqlSignals = catalog.projects.filter((project) => project.indicators.mssql).length;
    const projectPostgresSignals = catalog.projects.filter((project) => project.indicators.postgres).length;
    const mssqlSignals = mssql.data.total_count + projectMssqlSignals;
    const postgresSignals = postgres.data.total_count + projectPostgresSignals;

    return {
      success: true,
      data: {
        repo: catalog.resolvedRepo.fullName,
        branch: catalog.resolvedBranch,
        status: detectMigrationStatus(mssqlSignals, postgresSignals),
        mssql_signals: mssqlSignals,
        postgres_signals: postgresSignals,
        project_count: graph.nodes.length,
        evidence: {
          mssql: mssql.data,
          postgres: postgres.data,
          projects: catalog.projects
        }
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.classify_migration_status', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to classify migration status.'
    };
  }
}

export async function traceCallChain(input: GitHubTraceCallChainInput): Promise<ToolResponse<TraceCallChainResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.trace_call_chain', repo: input.repo, org: input.org });

  try {
    const depthLimit = Math.max(1, Math.min(6, input.depth ?? 3));
    const nodeLimit = clampGitHubLimit(input.limit, 1, 50, 20);
    const repo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
    const repoContext = await getGitHubRepositoryContext(repo.fullName, input.branch);
    const visited = new Set<string>();
    const nodes: TraceCallChainNode[] = [];
    const edges: ProjectGraphEdge[] = [];

    async function visit(symbol: string, currentPath: string | undefined, className: string | undefined, depth: number): Promise<void> {
      if (nodes.length >= nodeLimit || depth > depthLimit) {
        return;
      }

      const key = `${symbol}|${currentPath || ''}|${className || ''}`.toLowerCase();
      if (visited.has(key)) {
        return;
      }

      visited.add(key);

      const definition = await getMethodDefinition({
        org: input.org,
        repo: input.repo,
        branch: input.branch,
        path: currentPath,
        class_name: className,
        name: symbol,
        limit: 1
      });

      if (!definition.success || !definition.data || definition.data.matches.length === 0) {
        return;
      }

      const match = definition.data.matches[0];
      const callees = extractCallNames(match.definition).slice(0, 10);

      nodes.push({
        symbol,
        path: match.path,
        class_name: match.class_name,
        depth,
        start_line: match.start_line,
        end_line: match.end_line,
        calls: callees,
        definition: match.definition
      });

      for (const callee of callees) {
        if (nodes.length >= nodeLimit) {
          break;
        }

        edges.push({ from: symbol, to: callee });
        await visit(callee, match.path, match.class_name, depth + 1);
      }
    }

    await visit(input.entry_symbol.trim(), input.path, input.class_name, 1);

    return {
      success: true,
      data: {
        repo: repoContext.repo,
        branch: repoContext.resolvedBranch,
        entry_symbol: input.entry_symbol.trim(),
        depth_limit: depthLimit,
        node_limit: nodeLimit,
        truncated: nodes.length >= nodeLimit,
        nodes,
        edges
      },
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.trace_call_chain', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to trace call chain.'
    };
  }
}
