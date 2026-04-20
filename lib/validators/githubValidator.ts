import { getCredentialContext } from '@/lib/auth/credentials';
import { CONFIG } from '@/lib/config';

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_REPO_ALLOWLIST_PATTERN = /^[A-Za-z0-9_.-]+\/(\*|[A-Za-z0-9_.-]+)$/;

export function normalizeGitHubRepository(repository: string): string {
  const normalized = repository.trim();

  if (!normalized) {
    throw new Error('GitHub repository is required.');
  }

  if (!GITHUB_REPO_PATTERN.test(normalized)) {
    throw new Error('GitHub repository must use owner/repo format.');
  }

  return normalized;
}

function normalizeGitHubRepositoryAllowlistEntry(entry: string): string {
  const normalized = entry.trim().toLowerCase();

  if (!normalized) {
    throw new Error('GitHub repository allowlist entry is required.');
  }

  if (!GITHUB_REPO_ALLOWLIST_PATTERN.test(normalized)) {
    throw new Error('GitHub repository allowlist entries must use owner/repo or owner/* format.');
  }

  return normalized;
}

export function matchesGitHubRepositoryAllowlistEntry(repository: string, allowlistEntry: string): boolean {
  const normalizedRepository = normalizeGitHubRepository(repository).toLowerCase();
  const normalizedEntry = normalizeGitHubRepositoryAllowlistEntry(allowlistEntry);

  if (normalizedEntry.endsWith('/*')) {
    return normalizedRepository.startsWith(`${normalizedEntry.slice(0, -1)}`);
  }

  return normalizedRepository === normalizedEntry;
}

/** Repos allowlist: per-credential (Advanced) when set, otherwise deployment env. */
export function resolveEffectiveGithubAllowedRepos(): string[] {
  const fromProfile = getCredentialContext()?.profile.github?.allowedRepos;
  if (fromProfile?.length) {
    return fromProfile;
  }
  return CONFIG.github.allowedRepos;
}

export function resolveEffectiveGithubAllowedOrgs(): string[] {
  const fromProfile = getCredentialContext()?.profile.github?.allowedOrgs;
  if (fromProfile?.length) {
    return fromProfile;
  }
  return CONFIG.github.allowedOrgs;
}

export function resolveEffectiveGithubOrgName(): string {
  const fromProfile = getCredentialContext()?.profile.github?.orgName?.trim();
  if (fromProfile) {
    return fromProfile;
  }
  return CONFIG.github.orgName.trim();
}

export function ensureAllowedGitHubRepository(repository: string): string {
  const normalized = normalizeGitHubRepository(repository).toLowerCase();
  const allowedRepos = resolveEffectiveGithubAllowedRepos();

  if (allowedRepos.length === 0) {
    throw new Error(
      'GitHub repositories are not configured. Add allowed repos in Advanced (token setup) or set GITHUB_ALLOWED_REPOS on the server.'
    );
  }

  if (!allowedRepos.some((repo) => matchesGitHubRepositoryAllowlistEntry(normalized, repo))) {
    throw new Error(`Repository ${normalized} is not allowlisted.`);
  }

  return normalized;
}

export function splitGitHubRepository(repository: string): { owner: string; name: string; fullName: string } {
  const normalized = normalizeGitHubRepository(repository);
  const [owner, name] = normalized.split('/');

  return {
    owner,
    name,
    fullName: `${owner}/${name}`
  };
}

export function normalizeGitHubPath(path?: string): string {
  if (!path) {
    return '';
  }

  const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!normalized) {
    return '';
  }

  if (normalized.includes('..')) {
    throw new Error('Relative path segments are not allowed.');
  }

  return normalized;
}

export function normalizeGitHubBranch(branch?: string): string | undefined {
  const normalized = branch?.trim();
  return normalized ? normalized : undefined;
}

export function sanitizeGitHubSearchQuery(query: string): string {
  const normalized = query.trim().replace(/\s+/g, ' ');

  if (!normalized) {
    throw new Error('Search query is required.');
  }

  if (normalized.length > 256) {
    throw new Error('Search query must be 256 characters or fewer.');
  }

  return normalized;
}

export function clampGitHubLimit(value: number | undefined, min: number, max: number, fallback: number): number {
  const resolved = value ?? fallback;
  return Math.max(min, Math.min(max, resolved));
}