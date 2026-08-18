import React, { Component } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check, Download } from 'lucide-react';

declare const __BUILD_ID__: string;

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

/** Everything this platform keeps in the browser, for the backup download. */
const LOCAL_KEY_PREFIX = 'eduversal';

/**
 * Catches a render-time crash anywhere in the platform.
 *
 * React unmounts the entire tree when a component throws, so without this the
 * platform fails as a blank white page - indistinguishable from a broken
 * deployment, and carrying no clue as to what actually went wrong. An appraiser
 * mid-observation cannot act on a white screen, and neither can anyone they
 * report it to.
 *
 * Observations live in this browser's localStorage until they sync, so the
 * screen leads with a backup download: whatever else is wrong, the records
 * should not be trapped behind the crash.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  // React ships no types of its own and @types/react is not a dependency here,
  // so the base class resolves to any and inherited members carry no types.
  // Declaring the two this class uses keeps them checked rather than silent.
  declare props: AppErrorBoundaryProps;
  declare setState: (next: Partial<AppErrorBoundaryState>) => void;

  state: AppErrorBoundaryState = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Keep the console copy: it is the only place the full stack survives if
    // the details below are truncated when they are pasted somewhere.
    console.error('Platform crashed during render:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  private details(): string {
    const { error, componentStack } = this.state;
    return [
      `${error?.name || 'Error'}: ${error?.message || 'unknown error'}`,
      `build ${typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown'}`,
      `url ${window.location.pathname}`,
      '',
      error?.stack || '(no stack)',
      '',
      'Component stack:',
      componentStack || '(none captured)',
    ].join('\n');
  }

  private handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(this.details());
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch {
      // Clipboard access can be refused; the details are on screen to select.
    }
  };

  private handleBackup = () => {
    const backup: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LOCAL_KEY_PREFIX)) backup[key] = localStorage.getItem(key) || '';
    }

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `eduversal-records-backup-${new Date().toISOString().substring(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return <>{this.props.children}</>;

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 font-sans">
        <div className="w-full max-w-xl">
          <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900">
                  The platform hit an error and stopped
                </h1>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Your saved observations have not been lost — they are still in this browser and in
                  the synced copy. Download a backup below before anything else, then reload.
                </p>
              </div>
            </div>

            <pre className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
              {this.details()}
            </pre>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
              <button
                type="button"
                onClick={this.handleBackup}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                Download backup
              </button>

              <button
                type="button"
                onClick={this.handleCopy}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
                {copied ? 'Copied' : 'Copy details'}
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                Reload
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-5 leading-relaxed">
            Send the copied details to whoever maintains this platform — they name the exact
            component that failed.
          </p>
        </div>
      </div>
    );
  }
}
