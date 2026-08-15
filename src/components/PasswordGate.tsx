import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw, AlertTriangle } from 'lucide-react';
import { EduversalLogo } from './EduversalLogo';

declare const __BUILD_ID__: string;

interface PasswordGateProps {
  children: React.ReactNode;
}

type GateStatus =
  | 'CHECKING'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'UNAVAILABLE' // server reachable, but no APP_PASSWORD configured
  | 'API_DOWN'; // /api/* is not answering with JSON at all

/**
 * Reads a JSON body, or returns null when the response is not actually JSON.
 *
 * A static host with no backend answers /api/* with an HTML 404 or the SPA
 * shell, which parses as "not JSON" rather than throwing anything useful -
 * so this distinguishes "the API is missing" from "the API said no".
 */
async function readJson(res: Response): Promise<any | null> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function describeNonJson(path: string, res: Response): string {
  const contentType = res.headers.get('content-type') || 'no content-type';
  return `${path} returned HTTP ${res.status} as ${contentType}, not JSON. The API is not deployed at this URL.`;
}

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
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Resume an existing session if the cookie is still valid.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await readJson(res);
        if (cancelled) return;

        if (!data) {
          setDiagnostic(describeNonJson('GET /api/auth/session', res));
          setStatus('API_DOWN');
          return;
        }
        if (data.authenticated) setStatus('UNLOCKED');
        else if (!data.configured) setStatus('UNAVAILABLE');
        else setStatus('LOCKED');
      } catch (err) {
        if (cancelled) return;
        setDiagnostic(
          `Could not reach /api/auth/session: ${
            err instanceof Error ? err.message : 'network error'
          }`
        );
        setStatus('API_DOWN');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !password) return;

    setSubmitting(true);
    setError(null);
    setDiagnostic(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await readJson(res);

      if (!data) {
        setDiagnostic(describeNonJson('POST /api/auth/login', res));
        setStatus('API_DOWN');
        return;
      }

      if (res.ok && data.success) {
        setPassword('');
        setStatus('UNLOCKED');
      } else {
        setError(data.error || `Sign-in failed (HTTP ${res.status}).`);
        setPassword('');
      }
    } catch (err) {
      setError(
        `Could not reach the server: ${
          err instanceof Error ? err.message : 'network error'
        }`
      );
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
              The server is running, but no platform password has been set. Add{' '}
              <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                APP_PASSWORD
              </code>{' '}
              to the environment variables and redeploy.
            </p>
          </div>
        ) : status === 'API_DOWN' ? (
          <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm text-center">
            <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mx-auto mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Backend Not Reachable</h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              The sign-in service did not respond. The frontend is deployed but the
              API is not running at this address, so no password can be accepted.
            </p>
            {diagnostic && (
              <p className="mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 text-left break-words">
                {diagnostic}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Retry
            </button>
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
        <p className="text-center text-[10px] text-slate-300 mt-1 font-mono">
          build {__BUILD_ID__}
        </p>
      </div>
    </div>
  );
};
