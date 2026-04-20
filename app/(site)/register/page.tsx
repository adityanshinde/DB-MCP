'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          username: username.trim(),
          connections: []
        })
      });

      const json = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Registration failed.');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="generator-root home-shell">
      <div className="page-layout generator-shell">
        <header className="page-intro glass-panel">
          <p className="eyebrow">Account</p>
          <h1 className="page-title">Create workspace</h1>
          <p className="lede lede--compact">
            Your <strong>email</strong> and <strong>workspace name</strong> become a permanent binding. You receive one MCP bearer token — add databases from the dashboard without minting new tokens until Redis TTL
            lapses (then re-login follows the same account).
          </p>
        </header>

        <form className="builder-form simple-form glass-panel form-surface" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
            <span className="field-hint">At least 10 characters.</span>
          </label>

          <label className="field">
            <span>Workspace name</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="alice_dev"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <span className="field-hint">Same rules as the token generator (3–32 chars, starts with a letter).</span>
          </label>

          {message ? (
            <p className="field-hint" style={{ color: 'var(--accent-warm, #c45)' }}>
              {message}
            </p>
          ) : null}

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? 'Creating…' : 'Register & sign in'}
          </button>

          <p className="field-hint">
            Already registered?{' '}
            <Link href="/login" className="site-nav__link site-nav__link--active">
              Sign in
            </Link>
          </p>

          <p className="field-hint">
            Optional: skip empty bootstrap and configure databases later — or use the anonymous{' '}
            <Link href="/generate">token setup</Link> if you prefer not to create an account.
          </p>
        </form>
      </div>
    </div>
  );
}
