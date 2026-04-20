import Link from 'next/link';

export const metadata = {
  title: 'About us'
};

export default function AboutPage() {
  return (
    <div className="docs-page">
      <header className="docs-page__intro glass-panel docs-page__intro--stripe">
        <p className="eyebrow">About</p>
        <h1 className="docs-page__title">Built for a cleaner workspace flow</h1>
        <p className="docs-page__lede docs-page__lede--lead">
          DB-MCP keeps the home page focused on first-time setup, then moves account and credential management into a proper
          dashboard after sign-in.
        </p>
      </header>

      <section className="docs-section glass-panel">
        <h2>What this product is for</h2>
        <ul className="docs-list docs-list--checks">
          <li>One bearer token per workspace</li>
          <li>Database aliases that can be added, edited, or removed later</li>
          <li>GitHub controls that stay separate from database credentials</li>
          <li>Same visual theme from landing page through dashboard</li>
        </ul>
      </section>

      <section className="docs-section glass-panel">
        <h2>UX goal</h2>
        <p>
          The dashboard is meant to feel like a control panel, not a long form. Summary data stays visible at the top while the
          edit sections are grouped by task.
        </p>
      </section>

      <section className="docs-section glass-panel">
        <h2>Next step</h2>
        <p>
          Open the <Link href="/dashboard">dashboard</Link> after sign-in, or start with <Link href="/generate">token setup</Link>
          if you are creating a new workspace.
        </p>
      </section>
    </div>
  );
}