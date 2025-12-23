import { useEffect, useState } from 'react';
import { BackgroundStyle } from '../types';
import { BG_STYLES } from '../constants';

type SettingsTab = 'appearance' | 'general';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  setToken: (token: string) => void;
  openrouterKey: string;
  setOpenrouterKey: (key: string) => void;
  showCouncilReviewerNames: boolean;
  setShowCouncilReviewerNames: (value: boolean) => void;
  bgStyle: BackgroundStyle;
  setBgStyle: (style: BackgroundStyle) => void;
}

// Display labels for background styles
const BG_LABELS: Record<BackgroundStyle, string> = {
  'dots-mesh': 'Dots Mesh',
  'dots': 'Dots',
  'dots-fade': 'Dots Fade',
  'grid': 'Grid',
  'mesh': 'Mesh',
  'animated-mesh': 'Animated',
  'none': 'Solid',
  // Other styles not in BG_STYLES but in the type
  'particles': 'Particles',
  'gradient': 'Gradient',
  'waves': 'Waves',
  'cyber': 'Cyber',
  'aurora': 'Aurora',
  'starfield': 'Starfield',
  'matrix': 'Matrix',
  'nebula': 'Nebula',
  'blocks': 'Blocks',
  'circuit': 'Circuit',
  'geo': 'Geo',
};

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
];

export default function SettingsModal({
  open,
  onClose,
  token,
  setToken,
  openrouterKey,
  setOpenrouterKey,
  showCouncilReviewerNames,
  setShowCouncilReviewerNames,
  bgStyle,
  setBgStyle,
}: SettingsModalProps) {
  const [showToken, setShowToken] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  useEffect(() => {
    if (!open) {
      setShowToken(false);
      setShowOpenRouterKey(false);
      // Reset to first tab when modal closes
      setActiveTab('general');
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center transition-all duration-200 ${activeTab === 'appearance' ? '' : 'bg-black/40 backdrop-blur-sm'}`}
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 shrink-0">
          <h2 className="text-base font-semibold text-slate-100">Settings</h2>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors active:scale-95"
            aria-label="Close settings"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800/60 px-5 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === tab.id
                ? 'text-blue-400'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <>
              {/* Background Style Section */}
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-1">Background Style</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Choose your preferred background pattern
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {BG_STYLES.map((style) => (
                    <button
                      key={style}
                      onClick={() => setBgStyle(style)}
                      className={`group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${bgStyle === style
                        ? 'bg-blue-500/20 border border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-slate-800/40 border border-slate-700/40 hover:bg-slate-800/60 hover:border-slate-600/50'
                        }`}
                      title={BG_LABELS[style]}
                    >
                      <div
                        className={`w-10 h-10 rounded-md overflow-hidden ${style === 'none' ? '' : `bg-${style}`
                          }`}
                        style={{ backgroundColor: '#0f172a' }}
                      />
                      <span
                        className={`text-[10px] font-medium truncate max-w-full ${bgStyle === style ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-300'
                          }`}
                      >
                        {BG_LABELS[style]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* General Tab */}
          {activeTab === 'general' && (
            <>
              {/* GitHub Token Section */}
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-1">GitHub Models API Token</h3>
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
                    onClick={() => setShowToken((v) => !v)}
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

              {/* OpenRouter API Key Section */}
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-1">OpenRouter API Key</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Add your OpenRouter API key to access external models like GLM-4.5-Air.
                  Token is stored only in your browser.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type={showOpenRouterKey ? 'text' : 'password'}
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value.trim())}
                    placeholder="sk-or-v1-xxxxxxxxxxxxxxxx"
                    autoComplete="off"
                    className="flex-1 rounded-lg bg-slate-950/60 border border-slate-700/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenRouterKey((v) => !v)}
                    className="min-w-[44px] min-h-[44px] w-11 h-11 sm:w-9 sm:h-9 rounded-lg border border-slate-700/60 bg-slate-800/40 text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors active:scale-95 flex items-center justify-center"
                    title={showOpenRouterKey ? 'Hide key' : 'Show key'}
                  >
                    {showOpenRouterKey ? (
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
                  href="https://openrouter.ai/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Get an OpenRouter API key
                </a>
              </div>

              {/* Council Settings Section */}
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-1">Council Mode</h3>
                <label className="flex items-start gap-3 text-xs text-slate-300 cursor-pointer mt-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-700/60 bg-slate-950/60 text-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-0 cursor-pointer transition-colors"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
