'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Mode = 'signin' | 'register';

type Props = {
  code?: string | null;
  groupName?: string | null;
  initialMode?: Mode;
};

export function AuthScreen({ code, groupName, initialMode = 'signin' }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(code ? 'register' : initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, ...(code ? { code } : {}) }),
      });
      const data = (await response.json().catch(() => ({}))) as { groupId?: string | null; error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Could not sign you in.');
        setBusy(false);
        return;
      }

      router.replace(data.groupId ? `/groups/${data.groupId}` : '/groups');
      router.refresh();
    } catch {
      setError('Network hiccup. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <header className="auth-head">
        <span className="monogram" aria-hidden>
          GA
        </span>
        <span className="wordmark">The Group Admin</span>
      </header>

      <div className="auth-scroll">
        {code && groupName ? (
          <div className="invite-banner">
            <span className="eyebrow">You are invited</span>
            <p className="invite-banner__name">{groupName}</p>
            <p className="micro">Create an account and you are in. No approval step.</p>
          </div>
        ) : null}

        <h1 className="display">
          One group.
          <br />
          Many plans.
          <br />
          <span className="display__accent">No confusion.</span>
        </h1>
        <p className="lede">
          A private space for your people: talk, plan the owambe, or start a shared goal together.
        </p>

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={`tabs__tab${mode === 'signin' ? ' is-active' : ''}`}
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`tabs__tab${mode === 'register' ? ' is-active' : ''}`}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              Create account
            </button>
          </div>

          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="field__input"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. TundeDJ"
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="field__input"
              name="password"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              required
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="btn btn--ink btn--block" type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>

          <p className="micro micro--center">
            Username is your identity in the group. No email needed.
            {mode === 'register' ? ' Passwords are stored as salted PBKDF2 hashes.' : ''}
          </p>
        </form>
      </div>
    </div>
  );
}
