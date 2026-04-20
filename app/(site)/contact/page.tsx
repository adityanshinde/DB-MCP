import Link from 'next/link';

export const metadata = {
  title: 'Contact us'
};

const sourceRepo = process.env.NEXT_PUBLIC_SOURCE_REPO_URL;
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export default function ContactPage() {
  return (
    <div className="docs-page">
      <header className="docs-page__intro glass-panel docs-page__intro--stripe">
        <p className="eyebrow">Contact</p>
        <h1 className="docs-page__title">Talk to the team or your deployment owner</h1>
        <p className="docs-page__lede docs-page__lede--lead">
          Use this page for support links, internal ownership details, and repo access when a deployment needs help.
        </p>
      </header>

      <section className="docs-section glass-panel">
        <h2>Support channels</h2>
        <ul className="docs-list docs-list--checks">
          <li>
            Email:{' '}
            {supportEmail ? (
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            ) : (
              <span>Set NEXT_PUBLIC_SUPPORT_EMAIL for this deployment.</span>
            )}
          </li>
          <li>
            Source repo:{' '}
            {sourceRepo ? (
              <a href={sourceRepo} target="_blank" rel="noreferrer">
                Open repository
              </a>
            ) : (
              <Link href="/github">GitHub access settings</Link>
            )}
          </li>
          <li>
            Need product help? Start with <Link href="/docs">docs</Link> or open the <Link href="/dashboard">dashboard</Link>.
          </li>
        </ul>
      </section>

      <section className="docs-section glass-panel">
        <h2>For maintainers</h2>
        <p>
          If you want a visible support mailbox, add <code>NEXT_PUBLIC_SUPPORT_EMAIL</code> to the deployment. The page will
          update automatically without changing the theme.
        </p>
      </section>
    </div>
  );
}