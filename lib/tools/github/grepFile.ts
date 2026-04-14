import { getFileContent } from '@/lib/tools/github/getFileContent';
import { resolveGitHubRepositoryContext } from '@/lib/tools/github/repoResolver';
import { logMcpError, logMcpEvent } from '@/lib/runtime/observability';
import { normalizeGitHubBranch, normalizeGitHubPath } from '@/lib/validators/githubValidator';
import type { ToolResponse } from '@/lib/types';

type GitHubGrepFileInput = {
  org?: string;
  repo?: string;
  path: string;
  branch?: string;
  query: string;
  regex?: boolean;
  case_sensitive?: boolean;
  context_lines?: number;
  start_line?: number;
  end_line?: number;
  max_matches?: number;
};

type GrepFileLine = {
  line_number: number;
  line: string;
};

type GrepFileMatch = {
  line_number: number;
  line: string;
  match_start_column: number | null;
  match_end_column: number | null;
  before: GrepFileLine[];
  after: GrepFileLine[];
};

type GrepFileResult = {
  repo: string;
  branch: string;
  path: string;
  query: string;
  regex: boolean;
  case_sensitive: boolean;
  context_lines: number;
  scan_start_line: number;
  scan_end_line: number;
  file_size_bytes: number;
  warning: string | null;
  total_matching_lines: number;
  returned_matching_lines: number;
  truncated: boolean;
  matches: GrepFileMatch[];
};

const MAX_QUERY_LENGTH = 256;
const DEFAULT_CONTEXT_LINES = 2;
const DEFAULT_MAX_MATCHES = 50;
const MAX_CONTEXT_LINES = 10;
const MAX_MATCHES = 500;
const FILE_SIZE_WARNING_BYTES = 200_000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(query: string, regex: boolean, caseSensitive: boolean): RegExp {
  const source = regex ? query : escapeRegExp(query);
  return new RegExp(source, caseSensitive ? '' : 'i');
}

function resolveMatchRange(line: string, query: string, regex: boolean, caseSensitive: boolean): { start: number; end: number } | null {
  if (regex) {
    const pattern = buildMatcher(query, true, caseSensitive);
    const match = pattern.exec(line);

    if (!match || match.index === undefined) {
      return null;
    }

    return {
      start: match.index + 1,
      end: match.index + match[0].length + 1
    };
  }

  const haystack = caseSensitive ? line : line.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const index = haystack.indexOf(needle);

  if (index === -1) {
    return null;
  }

  return {
    start: index + 1,
    end: index + needle.length + 1
  };
}

function buildLineSlice(lines: string[], startIndex: number, endIndex: number): GrepFileLine[] {
  const result: GrepFileLine[] = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    result.push({
      line_number: index + 1,
      line: lines[index] ?? ''
    });
  }

  return result;
}

async function loadGrepFile(input: GitHubGrepFileInput): Promise<GrepFileResult> {
  const resolvedRepo = resolveGitHubRepositoryContext({ org: input.org, repo: input.repo });
  const resolvedPath = normalizeGitHubPath(input.path);
  const resolvedBranch = normalizeGitHubBranch(input.branch);
  const contentResult = await getFileContent(input.repo, resolvedPath, resolvedBranch, input.org);

  if (!contentResult.success || !contentResult.data) {
    throw new Error(contentResult.error || 'Failed to fetch file content.');
  }

  const query = input.query.trim();
  if (!query) {
    throw new Error('Search query is required.');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`Search query must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  }

  const regex = Boolean(input.regex);
  const caseSensitive = Boolean(input.case_sensitive);
  const contextLines = Math.max(0, Math.min(MAX_CONTEXT_LINES, input.context_lines ?? DEFAULT_CONTEXT_LINES));
  const maxMatches = Math.max(1, Math.min(MAX_MATCHES, input.max_matches ?? DEFAULT_MAX_MATCHES));
  const matcher = buildMatcher(query, regex, caseSensitive);
  const lines = contentResult.data.content.replace(/\r\n/g, '\n').split('\n');
  const totalLines = lines.length;
  const rawStartLine = input.start_line ?? 1;
  const rawEndLine = input.end_line ?? totalLines;

  if (rawStartLine < 1 || rawEndLine < 1) {
    throw new Error('start_line and end_line must be positive integers.');
  }

  if (rawStartLine > rawEndLine) {
    throw new Error('start_line must be less than or equal to end_line.');
  }

  const scanStartLine = Math.min(Math.max(1, rawStartLine), totalLines + 1);
  const scanEndLine = Math.min(Math.max(scanStartLine, rawEndLine), totalLines);
  const scanStartIndex = Math.min(Math.max(0, scanStartLine - 1), totalLines);
  const scanEndExclusive = Math.min(Math.max(0, scanEndLine), totalLines);
  const matches: GrepFileMatch[] = [];
  let totalMatches = 0;
  let truncated = false;

  for (let index = scanStartIndex; index < scanEndExclusive; index += 1) {
    if (!matcher.test(lines[index] ?? '')) {
      matcher.lastIndex = 0;
      continue;
    }

    totalMatches += 1;

    if (matches.length < maxMatches) {
      const range = resolveMatchRange(lines[index] ?? '', query, regex, caseSensitive);
      const beforeStart = Math.max(0, index - contextLines);
      const afterEnd = Math.min(lines.length, index + contextLines + 1);

      matches.push({
        line_number: index + 1,
        line: lines[index] ?? '',
        match_start_column: range?.start ?? null,
        match_end_column: range?.end ?? null,
        before: buildLineSlice(lines, beforeStart, index),
        after: buildLineSlice(lines, index + 1, afterEnd)
      });
    } else {
      truncated = true;
      break;
    }

    matcher.lastIndex = 0;
  }

  return {
    repo: resolvedRepo.fullName,
    branch: contentResult.data.branch,
    path: contentResult.data.path,
    query,
    regex,
    case_sensitive: caseSensitive,
    context_lines: contextLines,
    file_size_bytes: contentResult.data.size,
    total_matching_lines: totalMatches,
    returned_matching_lines: matches.length,
    truncated,
    scan_start_line: scanStartLine,
    scan_end_line: scanEndLine,
    warning: contentResult.data.size > FILE_SIZE_WARNING_BYTES
      ? `File is ${contentResult.data.size} bytes; chunk scans by line range when possible.`
      : null,
    matches
  };
}

export async function grepFile(input: GitHubGrepFileInput): Promise<ToolResponse<GrepFileResult>> {
  logMcpEvent('tool.execute.start', { tool: 'github.grep_file', repo: input.repo, org: input.org });

  try {
    const result = await loadGrepFile(input);

    return {
      success: true,
      data: result,
      error: null
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'github.grep_file', repo: input.repo, org: input.org });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to grep file.'
    };
  }
}
