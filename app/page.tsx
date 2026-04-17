'use client';

import { useMemo, useState } from 'react';

type DbType = 'postgres' | 'mssql' | 'mysql' | 'sqlite';

type ConnectionDraft = {
  id: string;
  name: string;
  label: string;
  db: DbType;
  postgres: {
    url: string;
    host: string;
    port: string;
    username: string;
    password: string;
    database: string;
  };
  mssql: {
    server: string;
    port: string;
    username: string;
    password: string;
    database: string;
  };
  mysql: {
    host: string;
    port: string;
    username: string;
    password: string;
    database: string;
  };
  sqlite: {
    filePath: string;
  };
};

type TokenResult = {
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
  } | null;
};

type SubmitState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  result: TokenResult | null;
};

type CredentialPayload = {
  label?: string;
  defaultConnection?: string;
  connections: Array<
    | {
        name: string;
        label?: string;
        isDefault?: boolean;
        db: 'postgres';
        credentials: {
          host: string;
          port: number;
          username: string;
          password: string;
          database: string;
        };
      }
    | {
        name: string;
        label?: string;
        isDefault?: boolean;
        db: 'mssql';
        credentials: {
          server: string;
          port?: number;
          username: string;
          password: string;
          database: string;
        };
      }
    | {
        name: string;
        label?: string;
        isDefault?: boolean;
        db: 'mysql';
        credentials: {
          host: string;
          port: number;
          username: string;
          password: string;
          database: string;
        };
      }
    | {
        name: string;
        label?: string;
        isDefault?: boolean;
        db: 'sqlite';
        credentials: {
          filePath: string;
        };
      }
  >;
  github?: {
    orgName?: string;
    allowedOrgs?: string[];
    allowedRepos?: string[];
  };
};

const DEFAULT_CONNECTION: ConnectionDraft = {
  id: 'connection-main',
  name: 'main',
  label: 'Primary database',
  db: 'postgres',
  postgres: {
    url: '',
    host: 'localhost',
    port: '5432',
    username: 'postgres',
    password: '',
    database: 'appdb'
  },
  mssql: {
    server: 'localhost',
    port: '1433',
    username: 'sa',
    password: '',
    database: 'master'
  },
  mysql: {
    host: 'localhost',
    port: '3306',
    username: 'root',
    password: '',
    database: 'appdb'
  },
  sqlite: {
    filePath: 'data/app.db'
  }
};

const DEFAULT_GITHUB = {
  orgName: '',
  allowedOrgs: '',
  allowedRepos: ''
};

function createConnectionId(): string {
  return globalThis.crypto?.randomUUID?.() || `connection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createConnectionRow(overrides: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    ...DEFAULT_CONNECTION,
    ...overrides,
    id: overrides.id || createConnectionId(),
    postgres: { ...DEFAULT_CONNECTION.postgres, ...overrides.postgres },
    mssql: { ...DEFAULT_CONNECTION.mssql, ...overrides.mssql },
    mysql: { ...DEFAULT_CONNECTION.mysql, ...overrides.mysql },
    sqlite: { ...DEFAULT_CONNECTION.sqlite, ...overrides.sqlite }
  };
}

function formatExpiry(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function splitList(value: string): string[] {
  return value
    .split(/,|\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildFriendlyNameFromUrl(urlText: string): string {
  const trimmed = urlText.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/^\//, '') || 'main';
  } catch {
    return 'main';
  }
}

function parsePostgresUrl(urlText: string): Partial<ConnectionDraft['postgres']> {
  const trimmed = urlText.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('Postgres URL must start with postgres:// or postgresql://.');
  }

  const password = parsed.password ? decodeURIComponent(parsed.password) : '';
  const database = parsed.pathname.replace(/^\//, '');

  return {
    url: trimmed,
    host: parsed.hostname,
    port: parsed.port || '5432',
    username: parsed.username ? decodeURIComponent(parsed.username) : '',
    password,
    database: database ? decodeURIComponent(database) : ''
  };
}

function buildConnectionPayload(connection: ConnectionDraft) {
  const base = {
    name: connection.name.trim(),
    label: connection.label.trim() || undefined,
    isDefault: true
  };

  if (connection.db === 'postgres') {
    const parsedUrl = connection.postgres.url.trim() ? parsePostgresUrl(connection.postgres.url) : {};
    return {
      ...base,
      db: 'postgres' as const,
      credentials: {
        host: (parsedUrl.host || connection.postgres.host).trim(),
        port: Number(parsedUrl.port || connection.postgres.port),
        username: (parsedUrl.username || connection.postgres.username).trim(),
        password: parsedUrl.password ?? connection.postgres.password,
        database: (parsedUrl.database || connection.postgres.database).trim()
      }
    };
  }

  if (connection.db === 'mssql') {
    return {
      ...base,
      db: 'mssql' as const,
      credentials: {
        server: connection.mssql.server.trim(),
        port: Number(connection.mssql.port),
        username: connection.mssql.username.trim(),
        password: connection.mssql.password,
        database: connection.mssql.database.trim()
      }
    };
  }

  if (connection.db === 'mysql') {
    return {
      ...base,
      db: 'mysql' as const,
      credentials: {
        host: connection.mysql.host.trim(),
        port: Number(connection.mysql.port),
        username: connection.mysql.username.trim(),
        password: connection.mysql.password,
        database: connection.mysql.database.trim()
      }
    };
  }

  return {
    ...base,
    db: 'sqlite' as const,
    credentials: {
      filePath: connection.sqlite.filePath.trim()
    }
  };
}

function getDefaultConnectionName(connections: ConnectionDraft[]): string {
  return connections[0]?.name.trim() || 'main';
}

export default function HomePage() {
  const [profileLabel, setProfileLabel] = useState('My MCP profile');
  const [connection, setConnection] = useState<ConnectionDraft>(createConnectionRow());
  const [github, setGitHub] = useState(DEFAULT_GITHUB);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [state, setState] = useState<SubmitState>({ status: 'idle', message: '', result: null });

  const defaultConnectionName = useMemo(() => getDefaultConnectionName([connection]), [connection]);

  const tokenPreview = useMemo(() => {
    if (!state.result?.token) {
      return 'Your token will appear here after you create it.';
    }

    return `${state.result.token.slice(0, 18)}…${state.result.token.slice(-8)}`;
  }, [state.result]);

  const aliasesPreview = useMemo(() => {
    if (state.result?.aliases_by_type) {
      return Object.entries(state.result.aliases_by_type)
        .map(([type, names]) => `${type}: ${names.join(', ')}`)
        .join(' | ');
    }

    return connection.name.trim() ? `${connection.db}: ${connection.name.trim()}` : 'postgres: main';
  }, [connection.db, connection.name, state.result?.aliases_by_type]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const defaultName = getDefaultConnectionName([connection]);
    const parsedUrl = connection.db === 'postgres' && connection.postgres.url.trim() ? parsePostgresUrl(connection.postgres.url) : {};
    const payload: CredentialPayload = {
      label: profileLabel.trim() || undefined,
      defaultConnection: defaultName,
      connections: [
        {
          ...buildConnectionPayload({
            ...connection,
            name: connection.name.trim() || buildFriendlyNameFromUrl(connection.postgres.url),
            postgres: {
              ...connection.postgres,
              host: (parsedUrl.host || connection.postgres.host).trim(),
              port: parsedUrl.port || connection.postgres.port,
              username: parsedUrl.username || connection.postgres.username,
              password: parsedUrl.password ?? connection.postgres.password,
              database: parsedUrl.database || connection.postgres.database
            }
          })
        }
      ],
      ...(advancedOpen
        ? {
            github: {
              orgName: github.orgName.trim() || undefined,
              allowedOrgs: splitList(github.allowedOrgs),
              allowedRepos: splitList(github.allowedRepos)
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
        throw new Error(data.error || 'Failed to create token.');
      }

      setState({
        status: 'success',
        message: 'Token created. Copy it now, then add it to your MCP client as a Bearer token.',
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

  return (
    <main className="home-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <section className="hero-grid simplified-layout compact-layout">
        <div className="hero-copy glass-panel">
          <p className="eyebrow">DB-MCP</p>
          <h1>Paste your DB URL, generate token, done.</h1>
          <p className="lede">
            Default mode is one clean connection: a name and your Postgres URL. If you need more, open Advanced.
          </p>

          <div className="stat-row simplified-stats">
            <div className="stat-card">
              <span>Default</span>
              <strong>One Postgres URL</strong>
            </div>
            <div className="stat-card">
              <span>Advanced</span>
              <strong>Hidden by default</strong>
            </div>
            <div className="stat-card">
              <span>Output</span>
              <strong>Bearer token</strong>
            </div>
          </div>

          <div className="note-box compact-note">
            Paste a URL like <strong>postgresql://user:pass@host:5432/dbname</strong>. The page parses it for you, so you don’t need to fill host, port, or database separately.
          </div>
        </div>

        <div className="builder-panel glass-panel">
          <form onSubmit={handleSubmit} className="builder-form simple-form">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Token generator</p>
                <h2>Quick start</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setAdvancedOpen((current) => !current)}>
                {advancedOpen ? 'Hide advanced' : 'Advanced'}
              </button>
            </div>

            <label className="field">
              <span>Profile label</span>
              <input
                value={profileLabel}
                onChange={(event) => setProfileLabel(event.target.value)}
                placeholder="My MCP profile"
              />
            </label>

            <label className="field">
              <span>Connection name</span>
              <input
                value={connection.name}
                onChange={(event) => setConnection((current) => ({ ...current, name: event.target.value }))}
                placeholder="main"
              />
            </label>

            <label className="field">
              <span>Postgres URL</span>
              <input
                value={connection.postgres.url}
                onChange={(event) =>
                  setConnection((current) => ({
                    ...current,
                    postgres: {
                      ...current.postgres,
                      url: event.target.value
                    }
                  }))
                }
                placeholder="postgresql://user:pass@host:5432/dbname"
              />
            </label>

            {advancedOpen ? (
              <div className="advanced-panel">
                <div className="section-note">
                  <span>Advanced</span>
                  <p>Only open this if you need extra databases or GitHub allowlist notes. The normal flow does not need it.</p>
                </div>

                <label className="field">
                  <span>Database type</span>
                  <select
                    value={connection.db}
                    onChange={(event) => setConnection((current) => ({ ...current, db: event.target.value as DbType }))}
                  >
                    <option value="postgres">Postgres</option>
                    <option value="mssql">MSSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                </label>

                <label className="field">
                  <span>Secondary DB settings</span>
                  <textarea
                    className="json-input github-textarea"
                    value={JSON.stringify({ postgres: connection.postgres, mssql: connection.mssql, mysql: connection.mysql, sqlite: connection.sqlite }, null, 2)}
                    readOnly
                  />
                </label>

                <section className="github-card">
                  <div className="section-note">
                    <span>GitHub metadata</span>
                    <p>Optional. Keep repo access notes with the token profile.</p>
                  </div>

                  <div className="credential-grid">
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

            <button className="primary-button" type="submit" disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Creating token...' : 'Generate token'}
            </button>
          </form>

          <div className={`result-panel ${state.status}`}>
            <div className="panel-heading tight">
              <div>
                <p className="panel-kicker">Result</p>
                <h2>Token output</h2>
              </div>
              {state.result?.token ? (
                <button className="ghost-button" type="button" onClick={copyToken}>
                  Copy token
                </button>
              ) : null}
            </div>

            <p className="status-copy">
              {state.message || 'Create a token and we will show the bearer value, expiry, and alias summary here.'}
            </p>

            <div className="token-card">
              <span>Token</span>
              <strong>{tokenPreview}</strong>
            </div>

            <div className="result-grid">
              <div className="result-item">
                <span>Expires</span>
                <strong>{state.result ? formatExpiry(state.result.expires_at) : '72 hours after issue'}</strong>
              </div>
              <div className="result-item">
                <span>Default connection</span>
                <strong>{state.result?.default_connection || defaultConnectionName || 'main'}</strong>
              </div>
              <div className="result-item">
                <span>Aliases</span>
                <strong>{aliasesPreview || 'main'}</strong>
              </div>
              <div className="result-item">
                <span>GitHub</span>
                <strong>
                  {state.result?.github
                    ? state.result.github.org_name || state.result.github.allowed_repos.join(', ') || 'saved with profile'
                    : 'optional metadata only'}
                </strong>
              </div>
            </div>

            <div className="usage-box">
              <span>Use it like this</span>
              <code>Authorization: Bearer YOUR_TOKEN</code>
              <p>Point your MCP client at /api/mcp. The token resolves the correct database connection set on each request.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
