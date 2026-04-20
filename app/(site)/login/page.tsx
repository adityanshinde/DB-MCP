'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const json = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Login failed.');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('auth:changed', {
            detail: { signedIn: true, email: email.trim() }
          })
        );
      }
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="generator-root home-shell">
      <div className="page-layout generator-shell">
        <header className="page-intro glass-panel">
          <p className="eyebrow">Account</p>
          <h1 className="page-title">Sign in</h1>
          <p className="lede lede--compact">
            Access your dashboard to edit database connections without changing your MCP bearer token (until it expires in Redis).
          </p>
        </header>

        <form className="builder-form simple-form glass-panel form-surface" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>

          {message ? (
            <p className="field-hint" style={{ color: 'var(--accent-warm, #c45)' }}>
              {message}
            </p>
          ) : null}

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="field-hint">
            No account?{' '}
            <Link href="/register" className="site-nav__link site-nav__link--active">
              Register
            </Link>{' '}
            — your email and workspace name stay bound permanently.
          </p>
        </form>
      </div>
    </div>
  );
}
