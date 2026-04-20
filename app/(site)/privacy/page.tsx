import Link from 'next/link';

export const metadata = {
  title: 'Privacy'
};

export default function PrivacyPage() {
  return (
    <div className="docs-page">
      <header className="docs-page__intro glass-panel docs-page__intro--stripe">
        <p className="eyebrow">Privacy</p>
        <h1 className="docs-page__title">How DB-MCP handles your data</h1>
        <p className="docs-page__lede docs-page__lede--lead">
          Credentials stay encrypted server-side and the signed-in dashboard only exposes the data your account already owns.
        </p>
      </header>

      <section className="docs-section glass-panel">
        <h2>What we store</h2>
        <ul className="docs-list docs-list--checks">
          <li>Workspace identity and login session metadata</li>
          <li>Encrypted database credentials and GitHub allowlists</li>
          <li>Token expiry, default alias, and dashboard preferences</li>
        </ul>
      </section>

      <section className="docs-section glass-panel">
        <h2>What we do not expose</h2>
        <ul className="docs-list docs-list--checks">
          <li>Plaintext bearer tokens in public views</li>
          <li>Database credentials outside your workspace profile</li>
          <li>GitHub access outside configured allowlists</li>
        </ul>
      </section>

      <section className="docs-section glass-panel">
        <h2>Need help?</h2>
        <p>
          Visit <Link href="/contact">Contact</Link> or return to <Link href="/dashboard">Dashboard</Link>.
        </p>
      </section>
    </div>
  );
}