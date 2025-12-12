import { useEffect, useState } from 'react';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  setToken: (token: string) => void;
  showCouncilReviewerNames: boolean;
  setShowCouncilReviewerNames: (value: boolean) => void;
}

export default function SettingsModal({
  open,
  onClose,
  token,
  setToken,
  showCouncilReviewerNames,
  setShowCouncilReviewerNames,
}: SettingsModalProps) {
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (!open) setShowToken(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
          <h2 className="text-base font-semibold text-slate-100">Settings</h2>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors active:scale-95"
            aria-label="Close settings"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">GitHub Models API Token (Optional)</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              By default, the server uses its GitHub Actions secret token (free quota).
              Add your own PAT to use dedicated quota. Token is stored only in your browser.
            </p>

            <div className="flex items-center gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value.trim())}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                className="flex-1 rounded-lg bg-slate-950/60 border border-slate-700/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500/60"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="min-w-[44px] min-h-[44px] w-11 h-11 sm:w-9 sm:h-9 rounded-lg border border-slate-700/60 bg-slate-800/40 text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors active:scale-95 flex items-center justify-center"
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? (
                  <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-7-11-7a18.5 18.5 0 014.74-5.74M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.4 18.4 0 01-2.16 3.19M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" strokeWidth={2} />
                  </svg>
                )}
              </button>
            </div>

            <a
              href="https://github.com/settings/personal-access-tokens/new?description=GitHub+Models+API+token&name=Serverless+LLM+Playground&user_models=read"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Create a token (user_models:read)
            </a>
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Council</h3>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-700/60 bg-slate-950/60"
                checked={showCouncilReviewerNames}
                onChange={(e) => setShowCouncilReviewerNames(e.target.checked)}
              />
              <span>
                Show reviewer model names in anonymous reviews (UI only).
                <span className="block text-slate-500 mt-1">
                  Models remain blinded; this only affects what you see.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
