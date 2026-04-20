'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteFooter() {
  const pathname = usePathname();

  if (pathname.startsWith('/dashboard')) {
    return null;
  }

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span className="site-footer__brand">DB-MCP</span>
        <nav className="site-footer__nav" aria-label="Footer">
          <Link href="/docs">Docs</Link>
          <Link href="/github">GitHub</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <p className="site-footer__meta">Read-only SQL · MCP over HTTPS</p>
      </div>
    </footer>
  );
}
