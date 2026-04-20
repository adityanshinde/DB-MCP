'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ConnectionsEditor } from '@/components/workspace/ConnectionsEditor';
import type { TokenConnectionInput } from '@/lib/credentials/tokenConnection';
import {
  buildConnectionPayload,
  createConnectionRow,
  EMPTY_GITHUB_FORM,
  fallbackConnectionName,
  getDefaultConnectionName,
  githubFormFromApi,
  prepareConnectionForPayload,
  tokenInputsToConnectionDrafts,
  type GitHubFormState
} from '@/lib/site/connectionDraft';

function splitList(value: string): string[] {
  return value
    .split(/,|\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

type MePayload = {
  email: string;
  username: string;
  token: string;
  editor_payload: {
    default_connection: string | null;
    connections: TokenConnectionInput[];
    github: {
      orgName?: string;
      allowedOrgs?: string[];
      allowedRepos?: string[];
      pat?: string;
    } | null;
  };
  connections_as_form: TokenConnectionInput[];
  summary: {
    expires_at: number;
    default_connection: string | null;
    total: number;
    github?: {
      orgName?: string;
      allowedOrgs?: string[];
      allowedRepos?: string[];
      has_github_pat: boolean;
    };
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MePayload | null>(null);
  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [connections, setConnections] = useState(() => [createConnectionRow()]);
  const [defaultConnectionName, setDefaultConnectionName] = useState('main');
  const [githubForm, setGithubForm] = useState<GitHubFormState>(() => ({ ...EMPTY_GITHUB_FORM }));
  const [connMsg, setConnMsg] = useState('');
  const [ghMsg, setGhMsg] = useState('');
  const [savingConn, setSavingConn] = useState(false);
  const [savingGh, setSavingGh] = useState(false);
  const [tokenReveal, setTokenReveal] = useState(false);
  const [clientOrigin, setClientOrigin] = useState('');
  const [snippetTab, setSnippetTab] = useState<'http' | 'cursor' | 'claude' | 'json'>('http');
  const [activeSection, setActiveSection] = useState('overview');
  const [removingConnectionId, setRemovingConnectionId] = useState('');
  const [clearingGithub, setClearingGithub] = useState(false);

  const applyProfile = useCallback((data: MePayload) => {
    setMe(data);
    const drafts =
      data.connections_as_form?.length > 0
        ? tokenInputsToConnectionDrafts(data.connections_as_form)
        : [createConnectionRow()];
    setConnections(drafts);

    const dc =
      data.editor_payload.default_connection?.trim() ||
      data.summary.default_connection?.trim() ||
      getDefaultConnectionName(drafts);
    setDefaultConnectionName(dc || getDefaultConnectionName(drafts));

    setGithubForm(githubFormFromApi(data.editor_payload.github));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/auth/me');
        const json = (await response.json()) as { success?: boolean; error?: string; data?: MePayload };

        if (cancelled) {
          return;
        }

        if (response.status === 410) {
          setError(json.error || 'Your MCP credential expired in Redis.');
          return;
        }

        if (response.status === 401 || !json.success || !json.data) {
          router.replace('/login');
          return;
        }

        applyProfile(json.data);
      } catch {
        if (!cancelled) {
          setError('Could not load dashboard.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [router, applyProfile]);

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const sectionIds = ['overview', 'connections', 'access', 'snippets', 'activity', 'docs'];
    const sections = sectionIds
      .map((sectionId) => document.getElementById(sectionId))
      .filter((element): element is HTMLElement => Boolean(element));

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveSection(visibleEntry.target.id);
        }
      },
      {
        threshold: [0.2, 0.35, 0.5, 0.65],
        rootMargin: '-8% 0px -58% 0px'
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [me]);

  async function handleLogout() {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store'
    });

    if (!res.ok) {
      setConnMsg('Sign out failed. Please try again.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('auth:changed', {
          detail: { signedIn: false, email: '' }
        })
      );
      window.location.href = '/login';
      return;
    }

    router.replace('/login');
    router.refresh();
  }

  async function refreshMe() {
    const refresh = await fetch('/api/auth/me');
    const body = (await refresh.json()) as { success?: boolean; data?: MePayload };
    if (body.success && body.data) {
      applyProfile(body.data);
    }
  }

  async function handleSaveConnections(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingConn(true);
    setConnMsg('');

    try {
      const prepared = connections.map((c) => prepareConnectionForPayload(c));
      const names = prepared.map((c, index) => fallbackConnectionName(c, index));
      const trimmedDefault = defaultConnectionName.trim();
      if (!names.some((n) => n === trimmedDefault)) {
        throw new Error('Choose a default connection that matches one of your connection aliases.');
      }

      const connectionPayloads = prepared.map((c, index) => {
        const named = { ...c, name: fallbackConnectionName(c, index) };
        const isDefault = named.name.trim() === trimmedDefault;
        return buildConnectionPayload(named, isDefault);
      });

      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultConnection: trimmedDefault,
          connections: connectionPayloads
        })
      });

      const json = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Save failed.');
      }

      setConnMsg('Database connections saved. Your MCP bearer token is unchanged.');
      router.refresh();
      await refreshMe();
    } catch (err) {
      setConnMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingConn(false);
    }
  }

  async function handleSaveGithub(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingGh(true);
    setGhMsg('');

    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github: {
            orgName: githubForm.orgName.trim() || undefined,
            allowedOrgs: splitList(githubForm.allowedOrgs),
            allowedRepos: splitList(githubForm.allowedRepos),
            ...(githubForm.pat.trim() ? { pat: githubForm.pat.trim() } : {})
          }
        })
      });

      const json = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Save failed.');
      }

      setGhMsg('GitHub settings saved. Leave PAT blank to keep the stored token.');
      setGithubForm((g) => ({ ...g, pat: '' }));
      router.refresh();
      await refreshMe();
    } catch (err) {
      setGhMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingGh(false);
    }
  }

  async function handleClearGithub() {
    setClearingGithub(true);
    setGhMsg('');

    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github: null })
      });

      const json = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Clear failed.');
      }

      setGithubForm({ ...EMPTY_GITHUB_FORM });
      setGhMsg('GitHub access removed from this token.');
      router.refresh();
      await refreshMe();
    } catch (err) {
      setGhMsg(err instanceof Error ? err.message : 'Clear failed.');
    } finally {
      setClearingGithub(false);
    }
  }

  function removeConnectionRow(connectionId: string) {
    setRemovingConnectionId(connectionId);
    setConnMsg('');

    let nextDefaultConnectionName = defaultConnectionName;

    setConnections((rows) => {
      const next = rows.filter((row) => row.id !== connectionId);
      if (next.length === 0) {
        nextDefaultConnectionName = getDefaultConnectionName([createConnectionRow()]);
        return [createConnectionRow()];
      }

      if (!next.some((row) => row.name.trim() === defaultConnectionName.trim())) {
        nextDefaultConnectionName = fallbackConnectionName(next[0], 0);
      }

      return next;
    });

    if (nextDefaultConnectionName !== defaultConnectionName) {
      setDefaultConnectionName(nextDefaultConnectionName);
    }

    setRemovingConnectionId('');
    setConnMsg('Connection removed locally. Save changes to persist.');
  }

  async function copyToken() {
    if (!me?.token) return;
    await navigator.clipboard.writeText(me.token);
    setConnMsg('Token copied to clipboard.');
  }

  const expiresText = me?.summary.expires_at ? new Date(me.summary.expires_at).toLocaleString() : '—';

  const defaultSelectOptions = useMemo(() => {
    return connections.map((c, index) => ({
      id: c.id,
      value: fallbackConnectionName(c, index)
    }));
  }, [connections]);

  if (loading) {
    return (
      <div className="generator-root home-shell">
        <p className="section-note">Loading dashboard…</p>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="generator-root home-shell">
        <p className="section-note">{error || 'Unavailable.'}</p>
        <Link href="/login">Sign in</Link>
      </div>
    );
  }

  const connectionCountLabel = me.summary.total === 1 ? '1 connection' : `${me.summary.total} connections`;
  const allowedRepoCount = me.summary.github?.allowedRepos?.length ?? 0;
  const allowedOrgCount = me.summary.github?.allowedOrgs?.length ?? 0;
  const githubStatusLabel = me.summary.github
    ? me.summary.github.has_github_pat
      ? 'PAT stored'
      : 'Allowlist configured'
    : 'Not configured';
  const mcpUrl = clientOrigin ? `${clientOrigin}/api/mcp` : '/api/mcp';
  const tokenPreview = tokenReveal ? me.token : `${me.token.slice(0, 18)}…${me.token.slice(-10)}`;
  const sidebarLinks = [
    { href: '#overview', label: 'Overview' },
    { href: '#connections', label: 'Connections' },
    { href: '#access', label: 'Access' },
    { href: '#snippets', label: 'Snippets' },
    { href: '#activity', label: 'Activity' },
    { href: '#docs', label: 'Docs' }
  ];
  const overviewStats = [
    { label: 'Databases', value: connectionCountLabel },
    { label: 'Allowed repos', value: allowedRepoCount ? `${allowedRepoCount}` : '0' },
    { label: 'Token status', value: 'Active' },
    { label: 'Profile expiry', value: expiresText }
  ];
  const systemStatus = [
    { label: 'MCP API', value: 'Online', tone: 'good' },
    { label: 'DB checks', value: 'Healthy', tone: 'good' },
    { label: 'GitHub sync', value: me.summary.github ? 'Active' : 'Idle', tone: me.summary.github ? 'good' : 'muted' },
    { label: 'Token service', value: 'Active', tone: 'good' }
  ];
  const recentActivity = [
    `Workspace loaded for ${me.username}`,
    `${me.summary.total} database connection${me.summary.total === 1 ? '' : 's'} ready for MCP tools`,
    me.summary.github
      ? `${allowedOrgCount} org${allowedOrgCount === 1 ? '' : 's'} and ${allowedRepoCount} repo${allowedRepoCount === 1 ? '' : 's'} allowed`
      : 'GitHub access not configured yet',
    `Token expires at ${expiresText}`
  ];
  const snippetContent = {
    http: [
      `POST ${mcpUrl}`,
      'Content-Type: application/json',
      `Authorization: Bearer ${me.token}`,
      '',
      '{',
      '  "jsonrpc": "2.0",',
      '  "id": 1,',
      '  "method": "tools/list",',
      '  "params": {}',
      '}'
    ].join('\n'),
    cursor: JSON.stringify(
      {
        mcpServers: {
          'db-mcp': {
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${me.token}`
            }
          }
        }
      },
      null,
      2
    ),
    claude: [
      'mcp-remote --header "Authorization: Bearer ..."',
      `--url ${mcpUrl}`,
      'Use the same bearer token across your tools.'
    ].join('\n'),
    json: JSON.stringify(
      {
        endpoint: mcpUrl,
        authorization: 'Bearer …',
        defaultConnection: me.summary.default_connection ?? defaultConnectionName
      },
      null,
      2
    )
  } as const;

  return (
    <div className="generator-root home-shell dashboard-shell">
      <div className="dashboard-shell__inner">
        <aside className="dashboard-sidebar glass-panel">
          <div className="dashboard-sidebar__brand">
            <p className="panel-kicker">Workspace dashboard</p>
            <h1 className="dashboard-sidebar__title">{me.username}</h1>
            <p className="dashboard-sidebar__meta">Signed in as {me.email}</p>
          </div>

          <nav className="dashboard-nav" aria-label="Dashboard sections">
            {sidebarLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={activeSection === item.href.slice(1) ? 'dashboard-nav__link dashboard-nav__link--active' : 'dashboard-nav__link'}
                aria-current={activeSection === item.href.slice(1) ? 'page' : undefined}
                onClick={() => setActiveSection(item.href.slice(1))}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="dashboard-sidebar__stack">
            <div className="dashboard-sidebar__mini-card">
              <span>Endpoint</span>
              <strong>{mcpUrl}</strong>
            </div>
            <button type="button" className="ghost-button ghost-button--sm" onClick={() => void navigator.clipboard.writeText(mcpUrl)}>
              Copy MCP URL
            </button>
            <Link href="/generate" className="ghost-button ghost-button--sm">
              Generate token
            </Link>
          </div>
        </aside>

        <main className="dashboard-content">
          <header className="glass-panel dashboard-topbar" id="overview">
            <div className="dashboard-topbar__copy">
              <p className="panel-kicker">Dashboard / {me.username}</p>
              <h2 className="dashboard-topbar__title">All workspace controls in one place</h2>
              <p className="dashboard-topbar__text">
                Manage databases, GitHub access, tokens, snippets, and health without leaving the dashboard.
              </p>
            </div>

            <div className="dashboard-topbar__actions">
              <span className="status-pill status-pill--good">● Online</span>
              <button type="button" className="ghost-button" onClick={() => void navigator.clipboard.writeText(mcpUrl)}>
                Copy MCP URL
              </button>
              <button type="button" className="ghost-button" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </div>
          </header>

          <section className="dashboard-stat-grid" aria-label="Overview stats">
            {overviewStats.map((stat) => (
              <article key={stat.label} className="glass-panel dashboard-stat-card">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </article>
            ))}
          </section>

          <div className="dashboard-main-grid">
            <div className="dashboard-stack">
              <section className="glass-panel dashboard-card" id="connections">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">Workspace overview</p>
                    <h3 className="panel-title">Profile and endpoint</h3>
                  </div>
                  <div className="dashboard-card__actions">
                    <Link href="/generate" className="ghost-button ghost-button--sm">
                      Regenerate token
                    </Link>
                    <button type="button" className="ghost-button ghost-button--sm" onClick={() => void copyToken()}>
                      Copy token
                    </button>
                  </div>
                </div>

                <div className="dashboard-overview-grid">
                  <div className="dashboard-overview-panel">
                    <span>Workspace</span>
                    <strong>{me.username}</strong>
                    <p>Environment: Production</p>
                    <p>Endpoint: {mcpUrl}</p>
                  </div>
                  <div className="dashboard-overview-panel">
                    <span>Token management</span>
                    <strong>{githubStatusLabel}</strong>
                    <p>Bearer token preview: <code className="inline-code">{tokenPreview}</code></p>
                    <p>Expires: {expiresText}</p>
                  </div>
                </div>
              </section>

              <section className="glass-panel dashboard-card">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">Database connections</p>
                    <h3 className="panel-title">Manage aliases</h3>
                  </div>
                  <span className="status-pill">{connectionCountLabel}</span>
                </div>

                <p className="field-hint">
                  Add, edit, or remove connection aliases here. The default alias is the one MCP tools use when a request does
                  not specify a connection name.
                </p>

                <div className="dashboard-stored-list" aria-label="Stored database connections">
                  {connections.map((connection, index) => (
                    <div key={connection.id} className="dashboard-stored-item">
                      <div className="dashboard-stored-item__copy">
                        <strong>{connection.name || `Connection ${index + 1}`}</strong>
                        <span>{connection.db.toUpperCase()}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button ghost-button--sm dashboard-danger-button"
                        onClick={() => removeConnectionRow(connection.id)}
                        disabled={removingConnectionId === connection.id}
                      >
                        {removingConnectionId === connection.id ? 'Removing…' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>

                <form className="dashboard-form" onSubmit={handleSaveConnections}>
                  <label className="field">
                    <span>Default connection for MCP</span>
                    <select value={defaultConnectionName} onChange={(e) => setDefaultConnectionName(e.target.value)}>
                      {defaultSelectOptions.map((opt) => (
                        <option key={opt.id} value={opt.value}>
                          {opt.value}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">Must match one of the aliases below.</span>
                  </label>

                  <ConnectionsEditor
                    connections={connections}
                    setConnections={setConnections}
                    advancedOpen={advancedOpen}
                    defaultBadgeMode="named-default"
                    defaultConnectionName={defaultConnectionName}
                  />

                  <div className="dashboard-inline-actions">
                    <button className="ghost-button ghost-button--sm" type="button" onClick={() => setAdvancedOpen((o) => !o)}>
                      {advancedOpen ? 'Hide structured fields' : 'Show structured fields'}
                    </button>
                    <Link href="/docs" className="dashboard-inline-link">
                      Need connection help?
                    </Link>
                  </div>

                  {connMsg ? (
                    <p
                      className="field-hint"
                      style={{ color: connMsg.includes('saved') || connMsg.includes('copied') ? 'var(--muted)' : 'var(--accent-warm, #c45)' }}
                    >
                      {connMsg}
                    </p>
                  ) : null}

                  <button type="submit" className="primary-button" disabled={savingConn}>
                    {savingConn ? 'Saving…' : 'Save database connections'}
                  </button>
                </form>
              </section>

              <section className="glass-panel dashboard-card" id="access">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">GitHub access</p>
                    <h3 className="panel-title">Repository allowlist</h3>
                  </div>
                  <span className="status-pill">{me.summary.github ? 'Enabled' : 'Not configured'}</span>
                </div>

                <div className="dashboard-chip-row">
                  <span className="dashboard-chip">Repos: {allowedRepoCount}</span>
                  <span className="dashboard-chip">Orgs: {allowedOrgCount}</span>
                  <span className="dashboard-chip">{me.summary.github?.has_github_pat ? 'PAT stored' : 'No PAT'}</span>
                </div>

                <div className="dashboard-stored-list" aria-label="Stored GitHub access">
                  <div className="dashboard-stored-item dashboard-stored-item--stacked">
                    <div className="dashboard-stored-item__copy">
                      <strong>{me.summary.github?.orgName ? me.summary.github.orgName : 'No organization set'}</strong>
                      <span>
                        {allowedOrgCount} org{allowedOrgCount === 1 ? '' : 's'} · {allowedRepoCount} repo{allowedRepoCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="dashboard-stored-item__meta">
                      <span className="dashboard-chip">{me.summary.github?.has_github_pat ? 'PAT stored' : 'PAT empty'}</span>
                      <button
                        type="button"
                        className="ghost-button ghost-button--sm dashboard-danger-button"
                        onClick={() => void handleClearGithub()}
                        disabled={clearingGithub}
                      >
                        {clearingGithub ? 'Clearing…' : 'Delete GitHub access'}
                      </button>
                    </div>
                  </div>
                </div>

                <form className="dashboard-form" onSubmit={handleSaveGithub}>
                  <section className="github-card">
                    <div className="credential-grid">
                      <label className="field compact wide">
                        <span>GitHub PAT (personal access token)</span>
                        <input
                          type="password"
                          value={githubForm.pat}
                          onChange={(event) => setGithubForm((current) => ({ ...current, pat: event.target.value }))}
                          placeholder={me.summary.github?.has_github_pat ? 'Leave blank to keep stored PAT' : 'github_pat_… or ghp_…'}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <label className="field compact wide">
                        <span>Organization name</span>
                        <input
                          value={githubForm.orgName}
                          onChange={(event) => setGithubForm((current) => ({ ...current, orgName: event.target.value }))}
                          placeholder="myorg"
                        />
                      </label>
                      <label className="field compact wide">
                        <span>Allowed orgs</span>
                        <textarea
                          className="json-input github-textarea"
                          value={githubForm.allowedOrgs}
                          onChange={(event) => setGithubForm((current) => ({ ...current, allowedOrgs: event.target.value }))}
                          placeholder={'myorg\nanother-org'}
                        />
                      </label>
                      <label className="field compact wide">
                        <span>Allowed repos</span>
                        <textarea
                          className="json-input github-textarea"
                          value={githubForm.allowedRepos}
                          onChange={(event) => setGithubForm((current) => ({ ...current, allowedRepos: event.target.value }))}
                          placeholder={'owner/repo\nowner/*'}
                        />
                      </label>
                    </div>
                  </section>

                  {ghMsg ? (
                    <p className="field-hint" style={{ color: ghMsg.includes('saved') ? 'var(--muted)' : 'var(--accent-warm, #c45)' }}>
                      {ghMsg}
                    </p>
                  ) : null}

                  <div className="dashboard-inline-actions">
                    <button type="submit" className="primary-button" disabled={savingGh}>
                      {savingGh ? 'Saving…' : 'Save GitHub settings'}
                    </button>
                    <Link href="/github" className="dashboard-inline-link">
                      Review access rules
                    </Link>
                  </div>
                </form>
              </section>

              <section className="glass-panel dashboard-card" id="activity">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">Recent activity</p>
                    <h3 className="panel-title">Workspace events</h3>
                  </div>
                </div>

                <ul className="dashboard-activity-list">
                  {recentActivity.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className="dashboard-rail">
              <section className="glass-panel dashboard-card dashboard-card--rail">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">Token management</p>
                    <h3 className="panel-title">Bearer token</h3>
                  </div>
                </div>

                <code className="dashboard-token-preview">{tokenPreview}</code>
                <p className="field-hint">Expires {expiresText}</p>

                <div className="dashboard-inline-actions">
                  <button type="button" className="ghost-button ghost-button--sm" onClick={() => void copyToken()}>
                    Copy token
                  </button>
                  <Link href="/generate" className="ghost-button ghost-button--sm">
                    Regenerate
                  </Link>
                  <button type="button" className="ghost-button ghost-button--sm" onClick={() => void handleLogout()}>
                    Revoke / sign out
                  </button>
                </div>
              </section>

              <section className="glass-panel dashboard-card dashboard-card--rail" id="snippets">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">Client snippets</p>
                    <h3 className="panel-title">Quick copy</h3>
                  </div>
                </div>

                <div className="dashboard-snippet-tabs" role="tablist" aria-label="Client snippets">
                  {(['http', 'cursor', 'claude', 'json'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={snippetTab === tab}
                      className={snippetTab === tab ? 'dashboard-tab dashboard-tab--active' : 'dashboard-tab'}
                      onClick={() => setSnippetTab(tab)}
                    >
                      {tab.toUpperCase()}
                    </button>
                  ))}
                </div>

                <pre className="dashboard-code-block">{snippetContent[snippetTab]}</pre>
              </section>

              <section className="glass-panel dashboard-card dashboard-card--rail">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">System status</p>
                    <h3 className="panel-title">Health</h3>
                  </div>
                </div>

                <ul className="dashboard-status-list">
                  {systemStatus.map((item) => (
                    <li key={item.label} className="dashboard-status-row">
                      <span>{item.label}</span>
                      <strong className={item.tone === 'good' ? 'status-pill status-pill--good' : 'status-pill'}>{item.value}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="glass-panel dashboard-card dashboard-card--rail" id="docs">
                <div className="dashboard-card__header">
                  <div>
                    <p className="panel-kicker">Docs</p>
                    <h3 className="panel-title">Quick help</h3>
                  </div>
                </div>

                <div className="dashboard-help-stack">
                  <details>
                    <summary>How do I connect in Cursor?</summary>
                    <p>Use the token from this page, point Cursor at your MCP URL, and keep the bearer header on every request.</p>
                  </details>
                  <details>
                    <summary>How do I test a database?</summary>
                    <p>Add a connection alias, save it, then run the preflight from the same dashboard section.</p>
                  </details>
                  <details>
                    <summary>Where do I get more help?</summary>
                    <p>Read the docs, then open Contact if you need deployment-specific support.</p>
                  </details>
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
