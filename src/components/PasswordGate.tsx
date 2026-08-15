import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw, AlertTriangle } from 'lucide-react';
import { EduversalLogo } from './EduversalLogo';

interface PasswordGateProps {
  children: React.ReactNode;
}

type GateStatus = 'CHECKING' | 'LOCKED' | 'UNLOCKED' | 'UNAVAILABLE';

/**
 * Gates the platform behind the shared access password.
 *
 * The password itself lives only on the server (APP_PASSWORD); this screen
 * posts a candidate to /api/auth/login and the server replies with an
 * httpOnly session cookie, so no secret is ever present in the bundle.
 */
export const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [status, setStatus] = useState<GateStatus>('CHECKING');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Resume an existing session if the cookie is still valid.
  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.authenticated) setStatus('UNLOCKED');
        else if (!data.configured) setStatus('UNAVAILABLE');
        else setStatus('LOCKED');
      })
      .catch(() => {
        if (!cancelled) setStatus('LOCKED');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !password) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setPassword('');
        setStatus('UNLOCKED');
      } else {
        setError(data.error || 'Unable to sign in. Please try again.');
        setPassword('');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'UNLOCKED') {
    return <>{children}</>;
  }

  // Brief blank-ish state while the session check is in flight
  if (status === 'CHECKING') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-teal-700 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-sm">
        {/* Brand lockup */}
        <div className="flex flex-col items-center text-center mb-7">
          <EduversalLogo variant="full" size={128} />
          <h1 className="mt-4 text-base font-black text-slate-900 tracking-tight">
            Teacher Appraisal Platform
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Framework 2 • Classroom Observation &amp; Quality Assurance
          </p>
        </div>

        {status === 'UNAVAILABLE' ? (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm text-center">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mx-auto mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Access Not Configured</h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              No platform password has been set on the server. Add{' '}
              <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                APP_PASSWORD
              </code>{' '}
              to the environment and restart.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
          >
            <label
              htmlFor="platform-password"
              className="block text-xs font-bold text-slate-700 mb-2"
            >
              Platform Password
            </label>

            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="platform-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                placeholder="Enter password to continue"
                disabled={submitting}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none transition focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:opacity-60"
              />
            </div>

            {error && (
              <p role="alert" className="mt-2.5 text-xs text-red-600 font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !password}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#165963] hover:bg-[#11474f] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Unlock Platform'
              )}
            </button>
          </form>
        )}

        <p className="text-center text-[11px] text-slate-400 mt-5">
          Authorised Eduversal appraisers and school leadership only.
        </p>
      </div>
    </div>
  );
};
