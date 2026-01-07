import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, Zap, X, Check } from 'lucide-react';
import { Model, Mode } from '../types';
import { ChatAutoModeScope } from './ChatView';

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
  chatModelId: string | null;
  setChatModelId: (id: string | null) => void;
  chatAutoMode: boolean;
  setChatAutoMode: (value: boolean) => void;
  chatAutoModeScope: ChatAutoModeScope;
  setChatAutoModeScope: (value: ChatAutoModeScope) => void;
  setShowDock: (value: boolean) => void;
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
  chatModelId,
  setChatModelId,
  chatAutoMode,
  setChatAutoMode,
  chatAutoModeScope,
  setChatAutoModeScope,
  setShowDock,
}: ModelDockProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  type SectionType = 'self-hosted' | 'github' | 'external';
  type AccentColor = 'emerald' | 'blue' | 'purple';

  const sections: Array<{
    type: SectionType;
    title: string;
    accentColor: AccentColor;
    chatAutoScope: ChatAutoModeScope;
  }> = [
    {
      type: 'self-hosted',
      title: 'Self-Hosted Models',
      accentColor: 'emerald',
      chatAutoScope: 'self-hosted',
    },
    {
      type: 'github',
      title: 'GitHub Models',
      accentColor: 'blue',
      chatAutoScope: 'api',
    },
    {
      type: 'external',
      title: 'External Models',
      accentColor: 'purple',
      chatAutoScope: 'external',
    },
  ];

  const isInChatMode = mode === 'chat';
  const modelsToShow = isInChatMode ? allModels : availableModels;

  const filteredModels = useMemo(() => {
    if (!debouncedSearchQuery) return modelsToShow;
    const query = debouncedSearchQuery.toLowerCase();
    return modelsToShow.filter(m => m.name.toLowerCase().includes(query));
  }, [modelsToShow, debouncedSearchQuery]);

  const handleAutoModeClick = useCallback((scope: ChatAutoModeScope) => {
    if (isInChatMode) {
      setChatAutoMode(true);
      setChatAutoModeScope(scope);
      setShowDock(false);
    }
  }, [isInChatMode, setChatAutoMode, setChatAutoModeScope, setShowDock]);

  const handleModelClick = useCallback((modelId: string) => {
    if (isInChatMode) {
      setChatAutoMode(false);
      setChatModelId(modelId);
      setShowDock(false);
    } else {
      handleModelToggle(modelId);
    }
  }, [isInChatMode, setChatAutoMode, setChatModelId, setShowDock, handleModelToggle]);

  useEffect(() => {
    if (showDock) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
      setFocusedIndex(-1);
    } else {
      setSearchQuery('');
      setFocusedIndex(-1);
    }
  }, [showDock]);

  // Keyboard navigation
  useEffect(() => {
    if (!showDock) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Get all selectable items (auto buttons + models)
      const allItems: Array<{ type: 'auto' | 'model', scope?: ChatAutoModeScope, modelId?: string }> = [];

      sections.forEach(section => {
        const sectionModels = filteredModels.filter(m => m.type === section.type);
        if (sectionModels.length > 0 && isInChatMode) {
          allItems.push({ type: 'auto', scope: section.chatAutoScope });
        }
        sectionModels.forEach(model => {
          allItems.push({ type: 'model', modelId: model.id });
        });
      });

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsKeyboardNav(true);
        setFocusedIndex(prev => Math.min(prev + 1, allItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIsKeyboardNav(true);
        setFocusedIndex(prev => Math.max(prev - 1, -1));
        if (focusedIndex === 0) {
          searchInputRef.current?.focus();
        }
      } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < allItems.length) {
        e.preventDefault();
        const item = allItems[focusedIndex];
        if (item.type === 'auto' && item.scope) {
          handleAutoModeClick(item.scope);
        } else if (item.type === 'model' && item.modelId) {
          handleModelClick(item.modelId);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDock(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // Trap focus within modal
        if (focusedIndex === -1) {
          setFocusedIndex(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDock, focusedIndex, filteredModels, isInChatMode, sections, handleAutoModeClick, handleModelClick, setShowDock]);

  const isModelSelected = (modelId: string) => {
    if (isInChatMode) {
      return !chatAutoMode && chatModelId === modelId;
    }
    return false;
  };

  const isAutoModeActive = (scope: ChatAutoModeScope) => {
    return isInChatMode && chatAutoMode && chatAutoModeScope === scope;
  };

  const getAccentClasses = (color: AccentColor) => {
    const classMap = {
      emerald: {
        button: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10',
        autoActive: 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20',
        autoInactive: 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border-transparent',
        dot: 'bg-emerald-500',
        textColor: 'text-emerald-500',
        modelActive: 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20',
        focus: 'ring-2 ring-emerald-500/50',
      },
      blue: {
        button: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10',
        autoActive: 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20',
        autoInactive: 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border-transparent',
        dot: 'bg-blue-500',
        textColor: 'text-blue-500',
        modelActive: 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20',
        focus: 'ring-2 ring-blue-500/50',
      },
      purple: {
        button: 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10',
        autoActive: 'text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20',
        autoInactive: 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border-transparent',
        dot: 'bg-purple-500',
        textColor: 'text-purple-500',
        modelActive: 'text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20',
        focus: 'ring-2 ring-purple-500/50',
      },
    };
    return classMap[color];
  };

  // Calculate global index for keyboard navigation
  const getItemGlobalIndex = (sectionIndex: number, itemIndex: number, isAuto: boolean): number => {
    let globalIndex = 0;
    for (let i = 0; i < sectionIndex; i++) {
      const sect = sections[i];
      const models = filteredModels.filter(m => m.type === sect.type);
      if (models.length > 0) {
        if (isInChatMode) globalIndex++; // auto button
        globalIndex += models.length;
      }
    }
    if (isAuto) return globalIndex;
    return globalIndex + (isInChatMode ? 1 : 0) + itemIndex;
  };

  return (
    <div
      ref={dockRef}
      data-no-arena-scroll
      data-no-background
      className="fixed top-1/2 left-1/2 w-[min(90vw,600px)] max-h-[80vh] rounded-2xl flex flex-col z-[60] transition-all duration-300 shadow-2xl"
      style={{
        transform: showDock ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
        opacity: showDock ? 1 : 0,
        pointerEvents: showDock ? 'auto' : 'none',
      }}
    >
      {/* Header with Search */}
      <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800/95 backdrop-blur-md rounded-t-2xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Model Selection</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Click to add to arena or select for chat</p>
          </div>
          <button
            onClick={() => setShowDock(false)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-700/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-slate-800/95 backdrop-blur-md">
        {sections.map((section, sectionIndex) => {
          const modelsForSection = filteredModels.filter(m => m.type === section.type);
          const allModelsForSection = availableModels.filter(m => m.type === section.type);
          const allSelected = allSelectedByType[section.type];
          const hasAny = totalModelsByType[section.type] > 0;
          const accentClasses = getAccentClasses(section.accentColor);
          const isAutoActive = isAutoModeActive(section.chatAutoScope);

          if (allModelsForSection.length === 0) return null;

          const autoButtonIndex = getItemGlobalIndex(sectionIndex, 0, true);
          const isAutoFocused = focusedIndex === autoButtonIndex;

          return (
            <div key={section.type} className="flex flex-col gap-2">
              {/* Section header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${accentClasses.dot}`}
                  />
                  <h3 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                    {section.title}
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    ({allModelsForSection.length})
                  </span>
                </div>
                {!isInChatMode && (
                  <button
                    onClick={() => handleAddGroup(section.type)}
                    className={`text-[10px] font-medium px-2 py-1 rounded transition-colors duration-150 ${accentClasses.button} ${!hasAny ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={!hasAny}
                  >
                    {allSelected ? '− Remove All' : '+ Add All'}
                  </button>
                )}
              </div>

              {/* Auto option */}
              {isInChatMode && (
                <button
                  onClick={() => handleAutoModeClick(section.chatAutoScope)}
                  onMouseEnter={() => {
                    setIsKeyboardNav(false);
                    setFocusedIndex(autoButtonIndex);
                  }}
                  className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-[background-color,border-color,box-shadow] duration-150 border ${
                    isAutoActive ? accentClasses.autoActive : accentClasses.autoInactive
                  } ${isAutoFocused && isKeyboardNav ? accentClasses.focus : ''}`}
                  title="Auto mode with smart fallback"
                >
                  <div className="flex items-center gap-2">
                    <Zap size={14} className={isAutoActive ? accentClasses.textColor : 'text-slate-500'} />
                    <span className="text-xs font-medium">
                      Auto (Smart Fallback)
                    </span>
                  </div>
                  {isAutoActive && (
                    <Check size={14} className={accentClasses.textColor} />
                  )}
                </button>
              )}

              {/* Model list */}
              <div className="flex flex-col gap-1">
                {modelsForSection.map((model, modelIndex) => {
                  const isSelected = isModelSelected(model.id);
                  const itemGlobalIndex = getItemGlobalIndex(sectionIndex, modelIndex, false);
                  const isFocused = focusedIndex === itemGlobalIndex;
                  return (
                    <div
                      key={model.id}
                      draggable={!isInChatMode}
                      onDragStart={!isInChatMode ? (e) => handleDragStart(e, model.id) : undefined}
                      onClick={() => handleModelClick(model.id)}
                      onMouseEnter={() => {
                        setIsKeyboardNav(false);
                        setFocusedIndex(itemGlobalIndex);
                      }}
                      className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-[background-color,border-color,box-shadow] duration-150 border ${
                        isInChatMode
                          ? `cursor-pointer ${isSelected ? accentClasses.modelActive : 'hover:bg-white/5 border-transparent'}`
                          : `cursor-grab active:cursor-grabbing hover:bg-white/5 border-transparent`
                      } ${isFocused && isKeyboardNav ? accentClasses.focus : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${accentClasses.dot} ${isSelected ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'} transition-opacity`}
                        />
                        <span className={`text-xs font-medium ${isSelected ? 'text-slate-200' : 'text-slate-400 group-hover:text-slate-200'} transition-colors`}>
                          {model.name}
                        </span>
                      </div>
                      {isSelected && (
                        <Check size={14} className={accentClasses.textColor} />
                      )}
                    </div>
                  );
                })}
                {modelsForSection.length === 0 && searchQuery && (
                  <div className="text-[10px] text-slate-600 italic px-3 py-2">
                    No models match your search
                  </div>
                )}
                {modelsForSection.length === 0 && !searchQuery && (
                  <div className="text-[10px] text-slate-600 italic px-3 py-2">
                    All models are in the arena
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-5 py-3 border-t border-slate-700/50 bg-slate-900/50 backdrop-blur-md rounded-b-2xl">
        <p className="text-[10px] text-slate-500 text-center">
          Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[9px]">M</kbd> or <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[9px]">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
