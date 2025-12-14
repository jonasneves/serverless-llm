import { Mode } from '../types';

interface HeaderProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  setHoveredCard: (hovered: string | null) => void;
  clearSelection: () => void;
  cycleBgStyle: (direction: 'prev' | 'next') => void;
  showDock: boolean;
  setShowDock: (show: boolean) => void;
  onOpenSettings: () => void;
}

export default function Header({
  mode,
  setMode,
  setHoveredCard,
  clearSelection,
  cycleBgStyle,
  showDock,
  setShowDock,
  onOpenSettings
}: HeaderProps) {
  return (
    <div className="fixed top-0 left-0 right-0 flex items-center justify-between mb-2 px-3 sm:px-6 pt-4 sm:pt-6 z-50 pointer-events-none">
      {/* Background layer for hit testing if needed, or just let events pass through empty space */}
      <div className="absolute inset-0 pointer-events-auto" style={{ height: '100%', zIndex: -1 }} />

      {/* Left: Dock Toggle Only */}
      <div className="flex items-center gap-3 flex-1 pointer-events-auto">
        <button
          id="dockToggleBtn"
          onClick={() => setShowDock(!showDock)}
          className="min-w-[44px] min-h-[44px] w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors active:scale-95 focus:outline-none focus-visible:outline-none"
          title={showDock ? "Close Dock" : "Open Dock"}
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Center: Unified Title & Mode Toggle */}
      <div className="absolute left-1/2 -translate-x-1/2 max-w-[calc(100vw-10rem)] sm:max-w-none pointer-events-auto">
        <div className="flex items-center p-1.5 rounded-xl border border-slate-700/40 header-shell">
          {/* Title */}
          <div className="px-2 sm:px-4 flex items-center gap-2">
            <span className="font-bold text-slate-100 tracking-tight whitespace-nowrap text-sm sm:text-base">Model Arena</span>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-700/50 mx-0.5 sm:mx-1"></div>

          {/* Mode Toggle Track */}
          <div className="relative flex p-1 rounded-lg bg-black/20 mode-track">
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-md transition-all duration-300 ease-out mode-slider"
              style={{
                left: mode === 'compare'
                  ? '4px'
                  : mode === 'council'
                    ? 'calc((100% + 4px) / 3)'
                    : 'calc((200% - 4px) / 3)'
              }}
            />
            {(['Compare', 'Council', 'Roundtable'] as const).map(m => (
              <button
                key={m}
                tabIndex={-1}
                onClick={() => { setMode(m.toLowerCase() as Mode); setHoveredCard(null); clearSelection(); }}
                className={`relative z-10 py-2 sm:py-1.5 text-[11px] sm:text-xs font-medium transition-colors duration-200 min-h-[44px] sm:min-h-0 active:scale-95 focus:outline-none focus-visible:outline-none flex-1 flex items-center justify-center text-center ${mode === m.toLowerCase()
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Settings */}
      <div className="flex items-center gap-2 flex-1 justify-end pointer-events-auto">
        {/* Background Style Cycler */}
        <div className="hidden sm:flex items-center rounded-lg bg-slate-800/30 border border-slate-700/50">
          <button
            onClick={() => cycleBgStyle('prev')}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors active:scale-95 focus:outline-none focus-visible:outline-none"
            title="Previous background"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => cycleBgStyle('next')}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors active:scale-95 focus:outline-none focus-visible:outline-none"
            title="Next background"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="min-w-[44px] min-h-[44px] w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors active:scale-95 focus:outline-none focus-visible:outline-none"
          title="Settings"
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
