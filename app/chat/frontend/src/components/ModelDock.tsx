import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, X, Check } from 'lucide-react';
import { Model, Mode } from '../types';

interface ModelDockProps {
  showDock: boolean;
  availableModels: Model[];
  allSelectedByType: Record<'self-hosted' | 'github' | 'external', boolean>;
  totalModelsByType: Record<'self-hosted' | 'github' | 'external', number>;
  handleDragStart: (e: React.DragEvent, modelId: string) => void;
  handleModelToggle: (modelId: string) => void;
  handleAddGroup: (type: 'self-hosted' | 'github' | 'external') => void;
  dockRef: React.RefObject<HTMLDivElement>;
  mode: Mode;
  allModels: Model[];
  setShowDock: (value: boolean) => void;
  // Chat mode: multi-select
  chatSelectedModels?: Set<string>;
  onToggleChatModel?: (modelId: string) => void;
  onToggleChatGroup?: (type: 'self-hosted' | 'github' | 'external') => void;
}

export default function ModelDock({
  showDock,
  availableModels,
  allSelectedByType,
  totalModelsByType,
  handleDragStart,
  handleModelToggle,
  handleAddGroup,
  dockRef,
  mode,
  allModels,
  setShowDock,
  chatSelectedModels = new Set(),
  onToggleChatModel,
  onToggleChatGroup,
}: ModelDockProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  type SectionType = 'self-hosted' | 'github' | 'external';
  type AccentColor = 'emerald' | 'blue' | 'purple';

  const sections: Array<{ type: SectionType; title: string; accentColor: AccentColor }> = [
    { type: 'self-hosted', title: 'Self-Hosted', accentColor: 'emerald' },
    { type: 'github', title: 'GitHub Models', accentColor: 'blue' },
    { type: 'external', title: 'External', accentColor: 'purple' },
  ];

  const isInChatMode = mode === 'chat';
  const modelsToShow = isInChatMode ? allModels : availableModels;

  const filteredModels = useMemo(() => {
    if (!debouncedSearchQuery) return modelsToShow;
    const query = debouncedSearchQuery.toLowerCase();
    return modelsToShow.filter(m => m.name.toLowerCase().includes(query));
  }, [modelsToShow, debouncedSearchQuery]);

  const handleModelClick = useCallback((modelId: string) => {
    if (isInChatMode && onToggleChatModel) {
      onToggleChatModel(modelId);
    } else {
      handleModelToggle(modelId);
    }
  }, [isInChatMode, onToggleChatModel, handleModelToggle]);

  useEffect(() => {
    if (showDock) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
    }
  }, [showDock]);

  useEffect(() => {
    if (!showDock) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowDock(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDock, setShowDock]);

  const getAccentClasses = (color: AccentColor) => ({
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-400', active: 'bg-emerald-500/20 border-emerald-500/30' },
    blue: { dot: 'bg-blue-500', text: 'text-blue-400', active: 'bg-blue-500/20 border-blue-500/30' },
    purple: { dot: 'bg-purple-500', text: 'text-purple-400', active: 'bg-purple-500/20 border-purple-500/30' },
  }[color]);

  return (
    <div
      ref={dockRef}
      data-no-arena-scroll
      data-no-background
      className="fixed top-1/2 left-1/2 w-[min(90vw,500px)] max-h-[70vh] rounded-2xl flex flex-col z-[60] transition-all duration-300 shadow-2xl bg-slate-800/95 backdrop-blur-md"
      style={{
        transform: showDock ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
        opacity: showDock ? 1 : 0,
        pointerEvents: showDock ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">
            {isInChatMode ? 'Select Models' : 'Add to Arena'}
          </h2>
          {isInChatMode && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {chatSelectedModels.size === 0 ? 'Click to select' : `${chatSelectedModels.size} selected`}
            </p>
          )}
        </div>
        <button onClick={() => setShowDock(false)} className="text-slate-400 hover:text-slate-200">
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-slate-700/50">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500"
          />
        </div>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {sections.map((section) => {
          const modelsForSection = filteredModels.filter(m => m.type === section.type);
          const totalForSection = allModels.filter(m => m.type === section.type);
          const accent = getAccentClasses(section.accentColor);

          if (totalForSection.length === 0) return null;

          // Chat mode: check if all models of this type are selected
          const chatAllSelected = isInChatMode && totalForSection.every(m => chatSelectedModels.has(m.id));

          return (
            <div key={section.type}>
              <div className="flex items-center justify-between px-1 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${accent.dot}`} />
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                    {section.title} ({totalForSection.length})
                  </span>
                </div>
                {isInChatMode ? (
                  onToggleChatGroup && (
                    <button
                      onClick={() => onToggleChatGroup(section.type)}
                      className={`text-[10px] font-medium px-2 py-1 rounded ${accent.text} hover:bg-white/5`}
                    >
                      {chatAllSelected ? '− Remove All' : '+ Add All'}
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => handleAddGroup(section.type)}
                    className={`text-[10px] font-medium px-2 py-1 rounded ${accent.text} hover:bg-white/5`}
                  >
                    {allSelectedByType[section.type] ? '− Remove All' : '+ Add All'}
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {modelsForSection.map((model) => {
                  const isSelected = isInChatMode ? chatSelectedModels.has(model.id) : false;
                  return (
                    <div
                      key={model.id}
                      draggable={!isInChatMode}
                      onDragStart={!isInChatMode ? (e) => handleDragStart(e, model.id) : undefined}
                      onClick={() => handleModelClick(model.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
                        isSelected
                          ? accent.active
                          : 'hover:bg-white/5 border-transparent'
                      }`}
                    >
                      <span className={`text-xs font-medium ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                        {model.name}
                      </span>
                      {isSelected && <Check size={14} className={accent.text} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-700/50">
        <p className="text-[10px] text-slate-500 text-center">
          Press <kbd className="px-1 py-0.5 rounded bg-slate-700 text-slate-400 text-[9px]">M</kbd> or <kbd className="px-1 py-0.5 rounded bg-slate-700 text-slate-400 text-[9px]">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
