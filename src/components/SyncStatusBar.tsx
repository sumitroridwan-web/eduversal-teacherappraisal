import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  isSyncAvailable,
  pendingWriteCount,
  flushQueue,
  syncProblem,
  syncProblemDetail,
  SYNC_CHANGED_EVENT,
  type SyncProblem,
} from '../services/sync';

interface SyncStatusBarProps {
  lastSyncAt: string | null;
}

/**
 * Shows whether this device's work has reached the shared record.
 *
 * Worth the strip of screen: with several devices on one account during an
 * appraisal period, "did my observation actually save anywhere but here?" is a
 * question the appraiser should never have to guess at.
 */
export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({ lastSyncAt }) => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [problem, setProblem] = useState<SyncProblem>(syncProblem());

  useEffect(() => {
    isSyncAvailable().then(setAvailable);

    const refresh = () => {
      setPending(pendingWriteCount());
      setOnline(navigator.onLine);
      setProblem(syncProblem());
    };
    refresh();

    const timer = setInterval(refresh, 5000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener(SYNC_CHANGED_EVENT, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener(SYNC_CHANGED_EVENT, refresh);
    };
  }, [lastSyncAt]);

  // Nothing to say when sync was never configured for this deployment.
  if (available === null || available === false) return null;

  const handleFlush = async () => {
    setFlushing(true);
    try {
      await flushQueue();
      setPending(pendingWriteCount());
    } finally {
      setFlushing(false);
    }
  };

  const syncedLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const signedOut = problem === 'signed-out';

  const tone =
    signedOut
      ? 'bg-rose-50 border-rose-200 text-rose-900'
      : !online || pending > 0
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-emerald-50 border-emerald-200 text-emerald-800';

  return (
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-3 print:hidden">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs ${tone}`}
      >
        <span className="flex items-center gap-1.5 font-medium">
          {signedOut && online ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              Your sign-in has expired, so {pending ? `${pending} change${pending === 1 ? '' : 's'} and ` : ''}
              new photos cannot reach the other devices. Sign in again — nothing on this device is lost.
            </>
          ) : !online ? (
            <>
              <CloudOff className="w-3.5 h-3.5" />
              Offline — saved on this device, will sync when the connection returns
            </>
          ) : pending > 0 ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              {pending} change{pending === 1 ? '' : 's'} waiting to sync
              {problem === 'server'
                ? ` — ${syncProblemDetail() || 'the server did not accept it'}. Retrying automatically.`
                : ' — retrying automatically'}
            </>
          ) : (
            <>
              <Cloud className="w-3.5 h-3.5" />
              Synced across devices{syncedLabel ? ` • last checked ${syncedLabel}` : ''}
            </>
          )}
        </span>

        {signedOut && online ? (
          <button
            type="button"
            // The sign-in screen comes back on reload; work is kept on the device.
            onClick={() => window.location.reload()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-rose-100 border border-rose-300 font-semibold transition cursor-pointer"
          >
            Sign in again
          </button>
        ) : online && pending > 0 && (
          <button
            type="button"
            onClick={handleFlush}
            disabled={flushing}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/70 hover:bg-white border border-amber-300 font-semibold transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${flushing ? 'animate-spin' : ''}`} />
            Retry now
          </button>
        )}
      </div>
    </div>
  );
};
