import { useState, useMemo, useRef, useEffect } from 'react';
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sections = [
    {
      type: 'self-hosted' as const,
      title: 'Self-Hosted Models',
      accentColor: 'emerald',
      chatAutoScope: 'self-hosted' as ChatAutoModeScope,
    },
    {
      type: 'github' as const,
      title: 'GitHub Models',
      accentColor: 'blue',
      chatAutoScope: 'api' as ChatAutoModeScope,
    },
    {
      type: 'external' as const,
      title: 'External Models',
      accentColor: 'purple',
      chatAutoScope: 'external' as ChatAutoModeScope,
    },
  ];

  const isInChatMode = mode === 'chat';
  const modelsToShow = isInChatMode ? allModels : availableModels;

  const filteredModels = useMemo(() => {
    if (!searchQuery) return modelsToShow;
    const query = searchQuery.toLowerCase();
    return modelsToShow.filter(m => m.name.toLowerCase().includes(query));
  }, [modelsToShow, searchQuery]);

  useEffect(() => {
    if (showDock) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
    }
  }, [showDock]);

  const handleAutoModeClick = (scope: ChatAutoModeScope) => {
    if (isInChatMode) {
      setChatAutoMode(true);
      setChatAutoModeScope(scope);
      setShowDock(false);
    }
  };

  const handleModelClick = (modelId: string) => {
    if (isInChatMode) {
      setChatAutoMode(false);
      setChatModelId(modelId);
      setShowDock(false);
    } else {
      handleModelToggle(modelId);
    }
  };

  const isModelSelected = (modelId: string) => {
    if (isInChatMode) {
      return !chatAutoMode && chatModelId === modelId;
    }
    return false;
  };

  const isAutoModeActive = (scope: ChatAutoModeScope) => {
    return isInChatMode && chatAutoMode && chatAutoModeScope === scope;
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
        {sections.map(section => {
          const modelsForSection = filteredModels.filter(m => m.type === section.type);
          const allModelsForSection = availableModels.filter(m => m.type === section.type);
          const allSelected = allSelectedByType[section.type];
          const hasAny = totalModelsByType[section.type] > 0;
          const accentClasses = {
            emerald: {
              button: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10',
              auto: 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20',
              dot: 'bg-emerald-500',
              border: 'hover:border-emerald-500/40',
            },
            blue: {
              button: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10',
              auto: 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20',
              dot: 'bg-blue-500',
              border: 'hover:border-blue-500/40',
            },
            purple: {
              button: 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10',
              auto: 'text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20',
              dot: 'bg-purple-500',
              border: 'hover:border-purple-500/40',
            },
          }[section.accentColor as 'emerald' | 'blue' | 'purple']!;

          if (allModelsForSection.length === 0) return null;

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
                    className={`text-[10px] font-medium px-2 py-1 rounded transition-all active:scale-95 ${accentClasses.button} ${!hasAny ? 'opacity-40 cursor-not-allowed' : ''}`}
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
                  className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all border border-transparent active:scale-95 ${
                    isAutoModeActive(section.chatAutoScope)
                      ? accentClasses.auto + ' border-' + section.accentColor + '-500/40'
                      : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Auto mode with smart fallback"
                >
                  <div className="flex items-center gap-2">
                    <Zap size={14} className={isAutoModeActive(section.chatAutoScope) ? accentClasses.dot.replace('bg-', 'text-') : 'text-slate-500'} />
                    <span className="text-xs font-medium">
                      Auto (Smart Fallback)
                    </span>
                  </div>
                  {isAutoModeActive(section.chatAutoScope) && (
                    <Check size={14} className={accentClasses.dot.replace('bg-', 'text-')} />
                  )}
                </button>
              )}

              {/* Model list */}
              <div className="flex flex-col gap-1">
                {modelsForSection.map(model => {
                  const isSelected = isModelSelected(model.id);
                  return (
                    <div
                      key={model.id}
                      draggable={!isInChatMode}
                      onDragStart={!isInChatMode ? (e) => handleDragStart(e, model.id) : undefined}
                      onClick={() => handleModelClick(model.id)}
                      className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-all border border-transparent active:scale-95 ${
                        isInChatMode
                          ? `cursor-pointer ${isSelected ? accentClasses.auto + ' border-' + section.accentColor + '-500/40' : 'hover:bg-white/5'}`
                          : `cursor-grab active:cursor-grabbing hover:bg-white/5 ${accentClasses.border}`
                      }`}
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
                        <Check size={14} className={accentClasses.dot.replace('bg-', 'text-')} />
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
