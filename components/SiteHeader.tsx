'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { McpEndpointCopy } from '@/components/McpEndpointCopy';

const PUBLIC_NAV = [
  { href: '/#features', label: 'Features' },
  { href: '/docs', label: 'Docs' },
  { href: '/github', label: 'GitHub' },
  { href: '/signin', label: 'Sign in' },
  { href: '/generate', label: 'Get Started' }
] as const;

const SIGNED_IN_NAV = [
  { href: '/', label: 'Home' },
  { href: '/generate', label: 'Token setup' },
  { href: '/dashboard', label: 'Account' },
  { href: '/github', label: 'GitHub access' },
  { href: '/docs', label: 'Docs' }
] as const;

function useAuthStatus() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal
        });

        if (!mounted) return;

        if (!response.ok) {
          setIsSignedIn(false);
          setEmail('');
          return;
        }

        const body = (await response.json()) as { data?: { email?: string } };
        if (!mounted) return;
        setIsSignedIn(true);
        setEmail(body.data?.email?.trim() || '');
      } catch {
        if (!mounted) return;
        setIsSignedIn(false);
        setEmail('');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void checkAuth();

    const onAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ signedIn: boolean; email?: string }>).detail;
      if (!detail) return;
      setLoading(false);
      setIsSignedIn(Boolean(detail.signedIn));
      setEmail(detail.email?.trim() || '');
    };

    window.addEventListener('auth:changed', onAuthChanged as EventListener);

    return () => {
      mounted = false;
      controller.abort();
      window.removeEventListener('auth:changed', onAuthChanged as EventListener);
    };
  }, []);

  return { isSignedIn, loading, email };
}

export function SiteHeader() {
  const pathname = usePathname();
  const { isSignedIn, loading, email } = useAuthStatus();
  const isDashboard = pathname.startsWith('/dashboard');

  const navItems = useMemo(() => {
    if (loading) {
      return PUBLIC_NAV;
    }

    return isSignedIn ? SIGNED_IN_NAV : PUBLIC_NAV;
  }, [isSignedIn, loading]);

  if (isDashboard) {
    return null;
  }

  return (
    <header className="site-header glass-panel">
      <div className="site-header__inner">
        <div className="site-header__left">
          <Link href="/" className="site-brand">
            DB-MCP
          </Link>

          <div className="site-header__progress" aria-label="Suggested flow">
            <span className={pathname === '/' ? 'site-flow__dot site-flow__dot--on' : 'site-flow__dot'} />
            <span className="site-flow__line" />
            <span
              className={
                pathname === '/generate' || pathname.startsWith('/generate')
                  ? 'site-flow__dot site-flow__dot--on'
                  : 'site-flow__dot'
              }
            />
            <span className="site-flow__line" />
            <span className="site-flow__dot site-flow__dot--muted" title="Connect MCP client after generating token" />
          </div>
        </div>

        <nav className="site-nav" aria-label="Primary">
          {navItems.map(({ href, label }) => {
            const active =
              href === '/' ? pathname === '/' || pathname === '' : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={active ? 'site-nav__link site-nav__link--active' : 'site-nav__link'}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="site-header__right">
          <span className="site-status" title="If this page loads, the app route is reachable">
            <span className="site-status__dot" /> Online
          </span>

          {!loading && isSignedIn ? (
            <span className="site-user-chip" title={email || 'Signed in'}>
              {email ? `Signed in: ${email}` : 'Signed in'}
            </span>
          ) : null}

          <McpEndpointCopy />
        </div>
      </div>
    </header>
  );
}
