import Link from 'next/link';

function IconDatabase() {
  return (
    <svg className="workflow-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg className="workflow-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <path d="M10.5 11.5 13 9l6-6a2.121 2.121 0 0 1 3 3l-6 6" />
      <path d="M11.5 12.5 9 15" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </svg>
  );
}

function IconCursor() {
  return (
    <svg className="workflow-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.48.48 0 0 1 0 .932l-16 6.5a.495.495 0 0 1-.65-.652L7.293 13 4.038 9.783a.495.495 0 0 1 0-.697l3.255-3.398Z" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg className="landing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  );
}

function IconPlug() {
  return (
    <svg className="landing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-12 0V8Z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg className="landing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const HERO_SNIPPET = [
  '{',
  ' "mcpServers": {',
  '  "database": {',
  '   "url": "https://your-app/api/mcp",',
  '   "headers": {',
  '    "Authorization": "Bearer ..."',
  '   }',
  '  }',
  ' }',
  '}'
].join('\n');

export default function HomePage() {
  return (
    <div className="landing-page">
      <section className="glass-panel landing-hero-split landing-hero--surface">
        <div className="landing-hero-split__copy">
          <p className="eyebrow">Model Context Protocol · databases</p>
          <h1 className="landing-title landing-title--hero">Manage DB + GitHub MCP access from one workspace</h1>
          <p className="landing-sub landing-sub--hero">
            Create secure tokens, manage database aliases, and keep GitHub access scoped to each workspace.
          </p>
          <p className="landing-trust-line">Works with Cursor, Claude and VS Code.</p>

          <div className="landing-actions landing-actions--hero">
            <Link href="/generate" className="landing-cta landing-cta--primary landing-cta--lg">
              Get started
            </Link>
            <Link href="/docs" className="landing-cta landing-cta--ghost landing-cta--lg">
              View docs
            </Link>
          </div>

          <div className="landing-trust-strip" aria-label="Trust strip">
            <span>Online</span>
            <span>Secure tokens</span>
            <span>Multi-DB</span>
            <span>GitHub allowlist</span>
          </div>
        </div>

        <div className="landing-hero-split__visual landing-preview-shell">
          <div className="landing-preview-shell__panel landing-preview-shell__panel--code">
            <span className="landing-code-preview__label">mcp.json</span>
            <pre className="landing-code-preview">{HERO_SNIPPET}</pre>
          </div>
          <div className="landing-preview-shell__panel landing-preview-shell__panel--stats">
            <div className="preview-mini-card">
              <span>Dashboard</span>
              <strong>Overview + live controls</strong>
            </div>
            <div className="preview-mini-card">
              <span>Connections</span>
              <strong>Postgres · MySQL · MSSQL · SQLite</strong>
            </div>
            <div className="preview-mini-card">
              <span>Access</span>
              <strong>GitHub repo allowlists and PATs</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-panel landing-status-strip" aria-label="Live status">
        <span>● Online</span>
        <span>Secure tokens</span>
        <span>Multi-DB support</span>
        <span>GitHub allowlists</span>
      </section>

      <section id="features" className="glass-panel landing-section-pad" aria-labelledby="features-heading">
        <div className="panel-heading tight">
          <div>
            <p className="panel-kicker">Features</p>
            <h2 id="features-heading" className="landing-section-title">
              Everything in one product
            </h2>
          </div>
        </div>
        <div className="landing-feature-grid">
          <article className="landing-card glass-panel landing-card--feature">
            <IconDatabase />
            <h3>Database tools</h3>
            <p>Manage aliases for Postgres, MySQL, SQL Server, and SQLite in one workspace.</p>
          </article>
          <article className="landing-card glass-panel landing-card--feature">
            <IconKey />
            <h3>Token generation</h3>
            <p>Issue a single bearer token that stays stable while you update credentials.</p>
          </article>
          <article className="landing-card glass-panel landing-card--feature">
            <IconCursor />
            <h3>Client snippets</h3>
            <p>Copy ready-to-use snippets for HTTP clients, Cursor, Claude, and JSON configs.</p>
          </article>
          <article className="landing-card glass-panel landing-card--feature">
            <IconLayers />
            <h3>Secure workspaces</h3>
            <p>Keep credentials encrypted and scoped to the active bearer token.</p>
          </article>
          <article className="landing-card glass-panel landing-card--feature">
            <IconPlug />
            <h3>GitHub access</h3>
            <p>Allowlist orgs and repos without opening access to the whole account.</p>
          </article>
          <article className="landing-card glass-panel landing-card--feature">
            <IconShield />
            <h3>Live server status</h3>
            <p>See whether the API, DB checks, and token service are healthy at a glance.</p>
          </article>
        </div>
      </section>

      <section className="glass-panel landing-section-pad" id="how-it-works" aria-labelledby="how-heading">
        <div className="panel-heading tight">
          <div>
            <p className="panel-kicker">How it works</p>
            <h2 id="how-heading" className="landing-section-title">
              Simple flow, no wizard
            </h2>
          </div>
        </div>
        <ul className="workflow-cards workflow-cards--compact">
          <li className="workflow-card">
            <span className="workflow-card__index">1</span>
            <div>
              <h3>Create workspace</h3>
              <p>Sign in once and keep your profile tied to the same bearer token.</p>
            </div>
          </li>
          <li className="workflow-card">
            <span className="workflow-card__index">2</span>
            <div>
              <h3>Add connections</h3>
              <p>Paste URLs or use structured fields for each database alias.</p>
            </div>
          </li>
          <li className="workflow-card">
            <span className="workflow-card__index">3</span>
            <div>
              <h3>Generate token</h3>
              <p>Use the dashboard to keep credentials and GitHub access in sync.</p>
            </div>
          </li>
          <li className="workflow-card">
            <span className="workflow-card__index">4</span>
            <div>
              <h3>Connect client</h3>
              <p>Drop the token into Cursor, Claude, or any HTTP MCP client.</p>
            </div>
          </li>
        </ul>
      </section>

      <section id="preview" className="glass-panel landing-preview-band landing-section-pad">
        <div className="landing-preview-band__copy">
          <p className="panel-kicker">Preview</p>
          <h2 className="landing-section-title">Dashboard blocks you will use every day</h2>
          <p className="landing-sub landing-sub--compact">
            The signed-in area stays compact: summary cards, database controls, GitHub access, token management, snippets, and
            quick status in one screen.
          </p>
          <div className="landing-preview-band__actions">
            <Link href="/dashboard" className="landing-cta landing-cta--ghost">
              Open dashboard
            </Link>
            <Link href="/generate" className="landing-cta landing-cta--primary">
              Create workspace
            </Link>
          </div>
        </div>
        <div className="landing-preview-band__mock">
          <div className="preview-dashboard-card">
            <div className="preview-dashboard-card__row">
              <span>3 Databases</span>
              <span>12 Repos</span>
            </div>
            <div className="preview-dashboard-card__grid">
              <div>
                <strong>Token Active</strong>
                <p>Bearer token is live for this workspace.</p>
              </div>
              <div>
                <strong>Server Online</strong>
                <p>MCP API and DB checks are available.</p>
              </div>
            </div>
            <pre className="landing-code-preview landing-code-preview--tight">{`Dashboard / alice_dev
● Online
[Copy MCP URL] [Generate token]

Database Connections
[ PostgreSQL ] Connected
[ GitHub Access ] Allowed`}</pre>
          </div>
        </div>
      </section>

      <section className="glass-panel landing-cta-panel landing-cta-banner">
        <div>
          <p className="panel-kicker">Ready to start</p>
          <p>Build your workspace in minutes, then manage it from a single dashboard.</p>
        </div>
        <Link href="/generate" className="landing-cta landing-cta--primary landing-cta--lg">
          Start now
        </Link>
      </section>
    </div>
  );
}
