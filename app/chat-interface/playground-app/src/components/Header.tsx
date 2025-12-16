import { useState, useEffect, useRef } from 'react';
import { Mode } from '../types';

interface HeaderProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  setHoveredCard: (hovered: string | null) => void;
  clearSelection: () => void;
  showDock: boolean;
  setShowDock: (show: boolean) => void;
  onOpenSettings: () => void;
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'compare', label: 'Compare' },
  { value: 'council', label: 'Council' },
  { value: 'roundtable', label: 'Roundtable' },
  { value: 'personality', label: 'Personality' }
];

export default function Header({
  mode,
  setMode,
  setHoveredCard,
  clearSelection,
  showDock,
  setShowDock,
  onOpenSettings
}: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const currentModeIndex = MODES.findIndex(m => m.value === mode);
  const safeIndex = currentModeIndex === -1 ? 0 : currentModeIndex;
  const currentModeLabel = MODES[safeIndex].label;

  // Close mobile menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    }
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const handleModeSelect = (newMode: Mode) => {
    setMode(newMode);
    setHoveredCard(null);
    clearSelection();
    setIsMobileMenuOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const newIndex = (safeIndex + direction + MODES.length) % MODES.length;
      handleModeSelect(MODES[newIndex].value);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 flex items-center justify-between mb-2 px-3 sm:px-6 pt-4 sm:pt-6 z-50 pointer-events-none">
      {/* Background layer */}
      <div className="absolute inset-0 pointer-events-auto" style={{ height: '100%', zIndex: -1 }} />

      {/* Left: Empty spacer for balance */}
      <div className="flex items-center gap-3 w-10 sm:w-auto pointer-events-auto z-20" />

      {/* Center: Desktop Unified Title & Mode Toggle */}
      <div className="hidden md:block absolute left-1/2 -translate-x-1/2 pointer-events-auto z-20">
        <div className="flex items-center p-1.5 rounded-xl border border-slate-700/40 header-shell">
          {/* Menu Icon */}
          <button
            onClick={() => setShowDock(!showDock)}
            className="px-2 sm:px-3 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            title="Toggle Model Dock"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-700/50 mx-0.5 sm:mx-1"></div>

          {/* Mode Toggle Track */}
          <div
            className="relative flex p-1 rounded-lg bg-black/20 mode-track"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="radiogroup"
            aria-label="Mode selection"
          >
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-md transition-all duration-300 ease-out mode-slider"
              style={{
                width: `calc((100% - 8px) / ${MODES.length})`,
                left: `calc(4px + (100% - 8px) * ${safeIndex} / ${MODES.length})`
              }}
            />
            {MODES.map(m => (
              <button
                key={m.value}
                tabIndex={-1}
                onClick={() => handleModeSelect(m.value)}
                role="radio"
                aria-checked={mode === m.value}
                className={`relative z-10 py-2 sm:py-1.5 px-3 text-[11px] sm:text-xs font-medium transition-colors duration-200 min-h-[44px] sm:min-h-0 active:scale-95 focus:outline-none focus-visible:outline-none flex-1 flex items-center justify-center text-center ${mode === m.value
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center: Mobile Mode Dropdown */}
      <div className="flex md:hidden flex-1 justify-center pointer-events-auto relative z-20">
        <div className="relative" ref={mobileMenuRef}>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/90 border border-slate-700/50 text-slate-200 font-medium text-sm backdrop-blur-md shadow-lg active:scale-95 transition-all"
          >
            <span className="font-bold text-slate-400 hidden xs:inline">Arena</span>
            <span className="font-bold hidden xs:inline text-slate-600">/</span>
            <span>{currentModeLabel}</span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isMobileMenuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 py-1 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 origin-top">
              {MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => handleModeSelect(m.value)}
                  className={`px-4 py-3 text-sm text-left w-full transition-colors flex items-center justify-between ${mode === m.value
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                >
                  {m.label}
                  {mode === m.value && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Settings */}
      <div className="flex items-center gap-2 w-10 sm:w-auto justify-end pointer-events-auto z-20">
        <button
          onClick={onOpenSettings}
          className="min-w-[40px] min-h-[40px] w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700/50 hover:border-slate-600 transition-colors active:scale-95 focus:outline-none focus-visible:outline-none"
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
