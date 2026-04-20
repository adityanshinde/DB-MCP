import Link from 'next/link';

export const metadata = {
  title: 'GitHub access control'
};

export default function GitHubAccessPage() {
  return (
    <div className="docs-page">
      <header className="docs-page__intro glass-panel docs-page__intro--stripe">
        <p className="eyebrow">Repository access</p>
        <h1 className="docs-page__title">GitHub access control</h1>
        <p className="docs-page__lede docs-page__lede--lead">
          Allow AI agents to read selected repositories. Restrict access by organization or repo pattern so agents never roam
          outside the scope you intend.
        </p>
        <Link href="/generate" className="landing-cta landing-cta--primary">
          Configure in token setup
        </Link>
      </header>

      <section className="docs-section glass-panel github-benefits">
        <h2>Benefits</h2>
        <ul className="docs-list docs-list--checks">
          <li>Search and read files only inside allowed orgs/repos</li>
          <li>Browse directory trees with enforced depth limits</li>
          <li>Optional summaries and richer symbol helpers where tools support them</li>
        </ul>
      </section>

      <section className="docs-section glass-panel">
        <h2>Server-side configuration</h2>
        <p>
          Either paste a <strong>GitHub PAT</strong> under Advanced on token setup (stored encrypted with your MCP bearer
          token), or configure a deployment-wide PAT and allowlists via environment variables (see README). Typical keys when
          using server-side secrets:
        </p>
        <pre className="env-code-block">
          {[
            'GITHUB_PAT=github_pat___…',
            'GITHUB_ORG_NAME=myorg',
            'GITHUB_ALLOWED_ORGS=myorg,other-org',
            'GITHUB_ALLOWED_REPOS=owner/repo,owner/*'
          ].join('\n')}
        </pre>
        <p className="docs-muted">
          These apply to every request unless your bearer profile adds stricter per-token rules (below).
        </p>
      </section>

      <section className="docs-section glass-panel">
        <h2>Per-token allowlists (dashboard)</h2>
        <p>
          On <Link href="/generate">Token setup</Link>, open <strong>Advanced</strong> and set organization name, allowed
          orgs (one per line), and allowed repos (<code>owner/repo</code> or <code>owner/*</code>). They are stored encrypted
          with your MCP bearer token.
        </p>
      </section>

      <section className="docs-section glass-panel permissions-grid">
        <h2>Permission preview</h2>
        <div className="perm-two-col">
          <div className="perm-box perm-box--yes">
            <h3>Agents can</h3>
            <ul>
              <li>Read repository files</li>
              <li>Search code</li>
              <li>List directory trees (bounded depth)</li>
              <li>Read PR metadata where tools support it</li>
            </ul>
          </div>
          <div className="perm-box perm-box--no">
            <h3>Agents cannot</h3>
            <ul>
              <li>Push commits or open PRs (read-only tools)</li>
              <li>Delete repositories</li>
              <li>Access orgs/repos outside allowlists</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="docs-section glass-panel">
        <h2>Example MCP tools (subset)</h2>
        <p className="docs-muted">Exact names match your server version; common GitHub tools include:</p>
        <ul className="tool-chips">
          <li>
            <code>github_search_code</code>
          </li>
          <li>
            <code>github_get_file_content</code>
          </li>
          <li>
            <code>github_get_repo_tree</code>
          </li>
          <li>
            <code>github_list_org_repos</code>
          </li>
          <li>
            <code>github_file_summary</code>
          </li>
          <li>
            <code>github_search_files</code>
          </li>
        </ul>
      </section>
    </div>
  );
}
