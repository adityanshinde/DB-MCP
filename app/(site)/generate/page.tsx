'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { TokenConnectionInput } from '@/lib/credentials/tokenConnection';
import { normalizeMcpUsername } from '@/lib/mcpUsername';
import { ConnectionsEditor } from '@/components/workspace/ConnectionsEditor';
import {
  buildConnectionPayload,
  createConnectionRow,
  EMPTY_GITHUB_FORM,
  fallbackConnectionName,
  getDefaultConnectionName,
  prepareConnectionForPayload,
  suggestWorkspaceHandles,
  type ConnectionDraft,
  type GitHubFormState
} from '@/lib/site/connectionDraft';

type WorkspaceAvailState = 'idle' | 'checking' | 'invalid' | 'available' | 'taken' | 'unknown';

type TokenResult = {
  username: string;
  token: string;
  token_type: string;
  expires_at: number;
  expires_in_seconds: number;
  default_connection: string;
  total_connections: number;
  aliases_by_type: Record<string, string[]>;
  github?: {
    org_name?: string;
    allowed_orgs: string[];
    allowed_repos: string[];
    has_github_pat?: boolean;
  } | null;
};

type SubmitState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  result: TokenResult | null;
};

type CredentialPayload = {
  username: string;
  defaultConnection?: string;
  connections: TokenConnectionInput[];
  github?: {
    orgName?: string;
    allowedOrgs?: string[];
    allowedRepos?: string[];
    pat?: string;
  };
};

function formatExpiry(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function splitList(value: string): string[] {
  return value
    .split(/,|\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildCursorMcpConfig(origin: string, token: string, useWindowsNpx: boolean): string {
  const command = useWindowsNpx ? 'C:\\\\Program Files\\\\nodejs\\\\npx.cmd' : 'npx';
  return JSON.stringify(
    {
      mcpServers: {
        'db-mcp': {
          command,
          args: ['-y', 'mcp-remote', `${origin.replace(/\/$/, '')}/api/mcp`, '--header', 'Authorization:${DB_MCP_AUTH}'],
          env: {
            DB_MCP_AUTH: `Bearer ${token}`
          }
        }
      }
    },
    null,
    2
  );
}

export default function HomePage() {
  const [workspaceUsername, setWorkspaceUsername] = useState('');
  const [connections, setConnections] = useState<ConnectionDraft[]>(() => [createConnectionRow()]);
  const [github, setGitHub] = useState<GitHubFormState>(() => ({ ...EMPTY_GITHUB_FORM }));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [useWindowsNpxPath, setUseWindowsNpxPath] = useState(false);
  const [clientOrigin, setClientOrigin] = useState('');
  const [outputTab, setOutputTab] = useState<'cursor' | 'http' | 'fetch' | 'python'>('cursor');
  const [state, setState] = useState<SubmitState>({ status: 'idle', message: '', result: null });
  const [workspaceAvail, setWorkspaceAvail] = useState<WorkspaceAvailState>('idle');
  const workspaceCheckSeq = useRef(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setClientOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    const seq = ++workspaceCheckSeq.current;
    const trimmed = workspaceUsername.trim();

    if (!trimmed) {
      setWorkspaceAvail('idle');
      return;
    }

    if (!normalizeMcpUsername(workspaceUsername)) {
      setWorkspaceAvail('invalid');
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setWorkspaceAvail('checking');
      try {
        const res = await fetch(`/api/credentials/username?q=${encodeURIComponent(trimmed)}`);
        const data = (await res.json()) as { status: WorkspaceAvailState; normalized?: string };
        if (seq !== workspaceCheckSeq.current) {
          return;
        }
        if (data.status === 'available' || data.status === 'taken' || data.status === 'unknown' || data.status === 'invalid') {
          setWorkspaceAvail(data.status);
        } else {
          setWorkspaceAvail('unknown');
        }
      } catch {
        if (seq !== workspaceCheckSeq.current) {
          return;
        }
        setWorkspaceAvail('unknown');
      }
    }, 420);

    return () => window.clearTimeout(timeoutId);
  }, [workspaceUsername]);

  const workspaceSuggestions = useMemo(() => {
    const n = normalizeMcpUsername(workspaceUsername);
    if (!n || workspaceAvail !== 'taken') {
      return [];
    }

    return suggestWorkspaceHandles(n);
  }, [workspaceUsername, workspaceAvail]);

  const cursorConfigSnippet = useMemo(() => {
    if (!state.result?.token || !clientOrigin) {
      return '';
    }

    return buildCursorMcpConfig(clientOrigin, state.result.token, useWindowsNpxPath);
  }, [state.result?.token, clientOrigin, useWindowsNpxPath]);

  const httpSnippet = useMemo(() => {
    if (!state.result?.token || !clientOrigin) return '';
    return [
      `POST ${clientOrigin}/api/mcp`,
      'Content-Type: application/json',
      `Authorization: Bearer ${state.result.token}`,
      '',
      '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }'
    ].join('\n');
  }, [state.result?.token, clientOrigin]);

  const fetchSnippet = useMemo(() => {
    if (!state.result?.token || !clientOrigin) return '';
    const t = state.result.token;
    return [
      `await fetch(\`${clientOrigin}/api/mcp\`, {`,
      `  method: 'POST',`,
      `  headers: {`,
      `    'Content-Type': 'application/json',`,
      `    Authorization: \`Bearer ${t}\``,
      `  },`,
      `  body: JSON.stringify({`,
      `    jsonrpc: '2.0',`,
      `    id: 1,`,
      `    method: 'tools/list',`,
      `    params: {}`,
      `  })`,
      `});`
    ].join('\n');
  }, [state.result?.token, clientOrigin]);

  const pythonSnippet = useMemo(() => {
    if (!state.result?.token || !clientOrigin) return '';
    return [
      `import httpx`,
      ``,
      `TOKEN = "<paste bearer token from above>"`,
      ``,
      `r = httpx.post(`,
      `    "${clientOrigin}/api/mcp",`,
      `    headers={"Authorization": f"Bearer {TOKEN}"},`,
      `    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},`,
      `)`,
      `r.raise_for_status()`,
      `print(r.json())`
    ].join('\n');
  }, [state.result?.token, clientOrigin]);

  const activeOutputSnippet = useMemo(() => {
    switch (outputTab) {
      case 'cursor':
        return cursorConfigSnippet;
      case 'http':
        return httpSnippet;
      case 'fetch':
        return fetchSnippet;
      case 'python':
        return pythonSnippet;
      default:
        return '';
    }
  }, [cursorConfigSnippet, fetchSnippet, httpSnippet, outputTab, pythonSnippet]);

  const tokenPreview = useMemo(() => {
    if (!state.result?.token) {
      return '—';
    }

    return `${state.result.token.slice(0, 18)}…${state.result.token.slice(-8)}`;
  }, [state.result]);

  const aliasesPreview = useMemo(() => {
    if (state.result?.aliases_by_type) {
      return Object.entries(state.result.aliases_by_type)
        .map(([type, names]) => `${type}: ${names.join(', ')}`)
        .join(' | ');
    }

    return (
      connections
        .map((row) => `${row.db}: ${row.name.trim() || '…'}`)
        .join(' | ') || '—'
    );
  }, [connections, state.result?.aliases_by_type]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prepared = connections.map((c) => prepareConnectionForPayload(c));
    const connectionPayloads = prepared.map((c, index) => {
      const named = { ...c, name: fallbackConnectionName(c, index) };
      return buildConnectionPayload(named, index === 0);
    });

    const normalizedHandle = normalizeMcpUsername(workspaceUsername);
    if (!normalizedHandle) {
      setState({
        status: 'error',
        message:
          'Choose a workspace name: 3–32 characters, start with a letter, then letters, digits, hyphen, or underscore (e.g. alice_dev).',
        result: null
      });
      return;
    }

    const payload: CredentialPayload = {
      username: normalizedHandle,
      defaultConnection: connectionPayloads[0]?.name || getDefaultConnectionName(prepared),
      connections: connectionPayloads,
      ...(advancedOpen
        ? {
            github: {
              orgName: github.orgName.trim() || undefined,
              allowedOrgs: splitList(github.allowedOrgs),
              allowedRepos: splitList(github.allowedRepos),
              ...(github.pat.trim() ? { pat: github.pat.trim() } : {})
            }
          }
        : {})
    };

    setState({ status: 'loading', message: 'Creating token…', result: null });

    try {
      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as { success: boolean; error?: string; data?: TokenResult };

      if (!response.ok || !data.success || !data.data) {
        const hint =
          response.status === 409
            ? `${data.error || 'Workspace name taken.'} Pick another workspace or wait until the previous token expires.`
            : data.error || 'Failed to create token.';
        throw new Error(hint);
      }

      setState({
        status: 'success',
        message:
          'Token created. Copy the Bearer token or the Cursor block below — one token carries every connection you added.',
        result: data.data
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong.',
        result: null
      });
    }
  }

  async function copyToken() {
    if (!state.result?.token) {
      return;
    }

    await navigator.clipboard.writeText(state.result.token);
    setState((current) => ({ ...current, message: 'Token copied to clipboard.' }));
  }

  async function copyOutputSnippet() {
    if (!activeOutputSnippet) return;
    await navigator.clipboard.writeText(activeOutputSnippet);
    const msg =
      outputTab === 'cursor'
        ? 'Cursor MCP config copied.'
        : outputTab === 'http'
          ? 'HTTP example copied.'
          : outputTab === 'fetch'
            ? 'Node fetch example copied.'
            : 'Python example copied.';
    setState((current) => ({ ...current, message: `${msg} Paste into your client or script.` }));
  }

  return (
    <div className="generator-root home-shell">
      <div className="page-layout generator-shell">
        <header className="page-intro glass-panel">
          <p className="eyebrow">DB-MCP</p>
          <h1 className="page-title">Token &amp; databases</h1>
          <p className="lede lede--compact">
            Pick a <strong>workspace</strong> name to group connections under one bearer token. Paste connection strings or open{' '}
            <strong>structured fields</strong>. Optional GitHub allowlists live under <strong>Advanced</strong>.
          </p>
        </header>

        <div className="page-workspace">
          <form onSubmit={handleSubmit} className="builder-form simple-form glass-panel form-surface">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Setup</p>
                <h2 className="panel-title">Connections</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setAdvancedOpen((current) => !current)}>
                {advancedOpen ? 'Hide advanced' : 'Advanced'}
              </button>
            </div>

            <label
              className={`field field-workspace ${workspaceAvail !== 'idle' ? `field-workspace--${workspaceAvail}` : ''}`}
            >
              <span className="field-workspace__label-row">
                Workspace name
                <span className="field-workspace__mark" aria-live="polite">
                  {workspaceAvail === 'available' ? (
                    <span className="field-workspace__badge field-workspace__badge--ok">✓ Available</span>
                  ) : null}
                  {workspaceAvail === 'taken' ? (
                    <span className="field-workspace__badge field-workspace__badge--bad">✗ Taken — pick another</span>
                  ) : null}
                  {workspaceAvail === 'invalid' ? (
                    <span className="field-workspace__badge field-workspace__badge--bad">✗ Invalid</span>
                  ) : null}
                  {workspaceAvail === 'checking' ? (
                    <span className="field-workspace__badge field-workspace__badge--muted">Checking…</span>
                  ) : null}
                  {workspaceAvail === 'unknown' ? (
                    <span className="field-workspace__badge field-workspace__badge--muted">Could not verify</span>
                  ) : null}
                </span>
              </span>
              <input
                value={workspaceUsername}
                onChange={(event) => setWorkspaceUsername(event.target.value)}
                placeholder="alice_dev"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={workspaceAvail === 'invalid' || workspaceAvail === 'taken'}
              />
              <span className="field-hint">
                We check availability live (same rule as signup on other apps): 3–32 chars, start with a letter, then letters,
                digits, <code>-</code>, <code>_</code>. Green means free; red means taken on this server — choose another or use
                a suggestion below.
              </span>
              {workspaceAvail === 'taken' && workspaceSuggestions.length > 0 ? (
                <div className="field-workspace__suggestions" role="group" aria-label="Suggested workspace names">
                  <span className="field-workspace__suggestions-label">Try:</span>
                  {workspaceSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="field-workspace__suggestion-btn"
                      onClick={() => setWorkspaceUsername(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>

            <ConnectionsEditor
              connections={connections}
              setConnections={setConnections}
              advancedOpen={advancedOpen}
              defaultBadgeMode="first-row"
            />

            {advancedOpen ? (
              <div className="advanced-panel">
                <div className="section-note">
                  <span>Advanced</span>
                  <p>
                    Optional GitHub access: paste your PAT here (encrypted with your MCP token) or rely on{' '}
                    <code className="inline-code">GITHUB_PAT</code> on the server. Restrict repos/orgs below.
                  </p>
                </div>

                <section className="github-card">
                  <div className="credential-grid">
                    <label className="field compact wide">
                      <span>GitHub PAT (personal access token)</span>
                      <input
                        type="password"
                        value={github.pat}
                        onChange={(event) => setGitHub((current) => ({ ...current, pat: event.target.value }))}
                        placeholder="github_pat_… or ghp_…"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <span className="field-hint">
                        Stored only in encrypted form with your bearer token. Not shown again after you generate.
                      </span>
                    </label>
                    <label className="field compact wide">
                      <span>Organization name</span>
                      <input
                        value={github.orgName}
                        onChange={(event) => setGitHub((current) => ({ ...current, orgName: event.target.value }))}
                        placeholder="myorg"
                      />
                    </label>
                    <label className="field compact wide">
                      <span>Allowed orgs</span>
                      <textarea
                        className="json-input github-textarea"
                        value={github.allowedOrgs}
                        onChange={(event) => setGitHub((current) => ({ ...current, allowedOrgs: event.target.value }))}
                        placeholder={'myorg\nanother-org'}
                      />
                    </label>
                    <label className="field compact wide">
                      <span>Allowed repos</span>
                      <textarea
                        className="json-input github-textarea"
                        value={github.allowedRepos}
                        onChange={(event) => setGitHub((current) => ({ ...current, allowedRepos: event.target.value }))}
                        placeholder={'owner/repo\nowner/*'}
                      />
                    </label>
                  </div>
                </section>
              </div>
            ) : null}

            <button
              className="primary-button"
              type="submit"
              disabled={
                state.status === 'loading' || workspaceAvail === 'taken' || workspaceAvail === 'invalid'
              }
            >
              {state.status === 'loading' ? 'Creating token…' : 'Generate token'}
            </button>
          </form>

          <aside className={`result-panel glass-panel result-surface result-panel--token ${state.status}`}>
            <div className="panel-heading tight result-panel__head">
              <div>
                <p className="panel-kicker">Output</p>
                <h2 className="panel-title">Token &amp; client snippets</h2>
              </div>
              {state.result?.token ? (
                <div className="result-actions">
                  <button className="ghost-button ghost-button--sm" type="button" onClick={copyToken}>
                    Copy token
                  </button>
                  {activeOutputSnippet ? (
                    <button className="ghost-button ghost-button--sm" type="button" onClick={copyOutputSnippet}>
                      Copy active snippet
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {state.result?.token ? (
              <p className="status-copy status-copy--success">{state.message}</p>
            ) : (
              <p className="status-copy status-copy--muted">
                {state.message ||
                  'Generate a token to see your bearer string, expiry, and ready-made snippets for HTTP clients and Cursor.'}
              </p>
            )}

            <div className={`token-card ${state.result?.token ? '' : 'token-card--pending'}`}>
              <span className="token-card__label">Bearer token</span>
              <strong className="token-card__value">{tokenPreview}</strong>
            </div>

            {state.result?.token ? (
              <dl className="result-summary">
                <div className="result-summary__row result-summary__row--full">
                  <dt>Workspace</dt>
                  <dd>
                    <code className="inline-code">{state.result.username}</code>
                  </dd>
                </div>
                <div className="result-summary__row">
                  <dt>Expires</dt>
                  <dd>{formatExpiry(state.result.expires_at)}</dd>
                </div>
                <div className="result-summary__row">
                  <dt>TTL</dt>
                  <dd>
                    ~{Math.max(1, Math.round(state.result.expires_in_seconds / 86400))} day
                    {Math.round(state.result.expires_in_seconds / 86400) === 1 ? '' : 's'} — set by{' '}
                    <code className="inline-code">MCP_CREDENTIAL_TTL_SECONDS</code> on the server
                  </dd>
                </div>
                <div className="result-summary__row result-summary__row--full">
                  <dt>Scope</dt>
                  <dd>Databases read-only · GitHub tools obey allowlists when configured</dd>
                </div>
                <div className="result-summary__row">
                  <dt>Default</dt>
                  <dd>{state.result.default_connection}</dd>
                </div>
                <div className="result-summary__row result-summary__row--full">
                  <dt>Connections</dt>
                  <dd>{aliasesPreview}</dd>
                </div>
                {(state.result.github?.org_name ||
                  (state.result.github?.allowed_repos?.length ?? 0) > 0 ||
                  state.result.github?.has_github_pat) && (
                  <div className="result-summary__row result-summary__row--full">
                    <dt>GitHub</dt>
                    <dd>
                      {state.result.github?.has_github_pat ? (
                        <>
                          PAT on file ·{' '}
                          {state.result.github?.org_name ||
                            state.result.github?.allowed_repos.join(', ') ||
                            'allowlists from server or Advanced'}
                        </>
                      ) : (
                        state.result.github?.org_name ||
                        state.result.github?.allowed_repos.join(', ') ||
                        '—'
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            ) : null}

            {state.result?.token ? (
              <div className="output-snippet-panel">
                <div className="output-tabs" role="tablist" aria-label="Snippet format">
                  {(
                    [
                      ['cursor', 'Cursor config'],
                      ['http', 'HTTP'],
                      ['fetch', 'Node fetch'],
                      ['python', 'Python']
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={outputTab === id}
                      className={outputTab === id ? 'output-tabs__btn output-tabs__btn--active' : 'output-tabs__btn'}
                      onClick={() => setOutputTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {outputTab === 'cursor' ? (
                  <label className="inline-check cursor-config-box">
                    <input
                      type="checkbox"
                      checked={useWindowsNpxPath}
                      onChange={(event) => setUseWindowsNpxPath(event.target.checked)}
                    />
                    Windows: use full <code>npx.cmd</code> path
                  </label>
                ) : null}

                <pre className="mcp-json-pre output-snippet-panel__pre">{activeOutputSnippet || '—'}</pre>

                <p className="copy-hint">
                  {outputTab === 'cursor' ? (
                    <>
                      Merge <code>db-mcp</code> into <code>.cursor/mcp.json</code> (or your client&apos;s MCP config) and
                      restart the MCP host.
                    </>
                  ) : outputTab === 'http' ? (
                    <>Streamable HTTP JSON-RPC to the same origin as this page.</>
                  ) : outputTab === 'fetch' ? (
                    <>Example request from Node 18+; adjust the JSON-RPC method and params for your tool.</>
                  ) : (
                    <>Install <code>httpx</code> and paste your bearer token into <code>TOKEN</code>.</>
                  )}
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
