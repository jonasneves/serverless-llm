import { Mode } from '../types';

interface HeaderProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  setExpanded: (expanded: string | null) => void;
  setSpeaking: (speaking: Set<string>) => void;
  setDragSelection: (selection: any) => void;
  cycleBgStyle: (direction: 'prev' | 'next') => void;
  showDock: boolean;
  setShowDock: (show: boolean) => void;
}

export default function Header({
  mode,
  setMode,
  setExpanded,
  setSpeaking,
  setDragSelection,
  cycleBgStyle,
  showDock,
  setShowDock
}: HeaderProps) {
  return (
    <div className="relative flex items-center justify-between mb-2 px-6 pt-6 z-50">
      {/* Left: Dock Toggle Only */}
      <div className="flex items-center gap-3 flex-1">
        <button
          id="dockToggleBtn"
          onClick={() => setShowDock(!showDock)}
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border border-slate-600/50 hover:border-slate-500 transition-all active:scale-95"
          title={showDock ? "Close Dock" : "Open Dock"}
        >
          <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Center: Unified Title & Mode Toggle */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <div
          className="flex items-center p-1.5 rounded-xl border border-slate-700/40"
          style={{
            background: 'rgba(30, 41, 59, 0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
          }}
        >
          {/* Title */}
          <div className="px-4 flex items-center gap-2">
            <span className="font-bold text-slate-100 tracking-tight whitespace-nowrap">Model Arena</span>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-700/50 mx-1"></div>

          {/* Mode Toggle Track */}
          <div className="relative flex p-1 rounded-lg bg-black/20" style={{ width: '320px' }}>
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-md transition-all duration-300 ease-out"
              style={{
                left: mode === 'compare'
                  ? '4px'
                  : mode === 'council'
                    ? 'calc((100% + 4px) / 3)'
                    : 'calc((200% - 4px) / 3)',
                width: 'calc((100% - 8px) / 3)',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(139, 92, 246, 0.4))',
                boxShadow: '0 2px 10px rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                zIndex: 0
              }}
            />
            {(['Compare', 'Council', 'Roundtable'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m.toLowerCase() as Mode); setExpanded(null); setSpeaking(new Set()); setDragSelection(null); }}
                className={`relative z-10 py-1.5 text-xs font-medium transition-colors duration-200 ${mode === m.toLowerCase()
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Settings */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        {/* Background Style Cycler */}
        <div className="flex items-center rounded-lg bg-slate-800/30 border border-slate-700/50">
          <button
            onClick={() => cycleBgStyle('prev')}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
            title="Previous background"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => cycleBgStyle('next')}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
            title="Next background"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Settings */}
        <button
          className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors"
          title="Settings"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
