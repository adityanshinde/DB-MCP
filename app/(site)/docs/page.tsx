import Link from 'next/link';

export const metadata = {
  title: 'Docs'
};

export default function DocsPage() {
  return (
    <div className="docs-page">
      <header className="docs-page__intro glass-panel">
        <p className="eyebrow">Documentation</p>
        <h1 className="docs-page__title">Getting started</h1>
        <p className="docs-page__lede">
          DB-MCP exposes an HTTP MCP endpoint at <code>/api/mcp</code>. Issue a bearer token from the dashboard, attach it on
          every request, and point your MCP client at your deployment URL.
        </p>
      </header>

      <section className="docs-section glass-panel">
        <h2>Quick path</h2>
        <ol className="docs-steps">
          <li>
            <Link href="/generate">Generate a token</Link> — add workspace name, DB connection strings, optional GitHub
            allowlists.
          </li>
          <li>Copy the Cursor <code>mcp.json</code> snippet or raw bearer token.</li>
          <li>
            For Cursor/Claude Desktop, use <code>mcp-remote</code> with <code>--header</code> and an env var for{' '}
            <code>Authorization: Bearer …</code> (see <code>examples/README.md</code> in the repo).
          </li>
        </ol>
      </section>

      <section className="docs-section glass-panel">
        <h2>Security</h2>
        <p>
          SQL is validated read-only before execution. Credentials are encrypted in Redis; each token is scoped to the
          connections you configured.
        </p>
      </section>

      <p className="docs-back">
        <Link href="/generate" className="landing-cta landing-cta--primary">
          Open token setup
        </Link>
      </p>
    </div>
  );
}
