import { Model } from '../types';

interface ModelDockProps {
  showDock: boolean;
  availableModels: Model[];
  allSelectedByType: Record<'self-hosted' | 'github' | 'external', boolean>;
  totalModelsByType: Record<'self-hosted' | 'github' | 'external', number>;
  handleDragStart: (e: React.DragEvent, modelId: string) => void;
  handleModelToggle: (modelId: string) => void;
  handleAddGroup: (type: 'self-hosted' | 'github' | 'external') => void;
  dockRef: React.RefObject<HTMLDivElement>;
}

export default function ModelDock({
  showDock,
  availableModels,
  allSelectedByType,
  totalModelsByType,
  handleDragStart,
  handleModelToggle,
  handleAddGroup,
  dockRef
}: ModelDockProps) {
  const sections = [
    {
      type: 'self-hosted' as const,
      title: 'Self-Hosted Models',
      accentColor: 'emerald',
    },
    {
      type: 'github' as const,
      title: 'GitHub Models',
      accentColor: 'blue',
    },
  ];

  return (
    <div
      ref={dockRef}
      data-no-arena-scroll
      data-no-background
      className="dock-scroll model-dock-panel fixed left-3 top-20 bottom-20 w-[min(75vw,320px)] sm:left-6 sm:top-24 sm:bottom-24 sm:w-72 rounded-2xl flex flex-col z-[60] transition-all duration-300 overflow-hidden"
      style={{
        transform: showDock ? 'translateX(0)' : 'translateX(-150%)',
        opacity: showDock ? 1 : 0,
        pointerEvents: showDock ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/50">
        <h2 className="text-sm font-semibold text-slate-200">Available Models</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Click to add to arena</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {sections.map(section => {
          const modelsForSection = availableModels.filter(m => m.type === section.type);
          const allSelected = allSelectedByType[section.type];
          const hasAny = totalModelsByType[section.type] > 0;
          const accentClasses = {
            emerald: {
              button: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10',
              dot: 'bg-emerald-500',
              border: 'hover:border-emerald-500/40',
            },
            blue: {
              button: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10',
              dot: 'bg-blue-500',
              border: 'hover:border-blue-500/40',
            },
          }[section.accentColor as 'emerald' | 'blue']!;

          return (
            <div key={section.type} className="flex flex-col gap-2">
              {/* Section header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${accentClasses.dot} ${section.type === 'self-hosted' ? 'glow-dot-emerald' : 'glow-dot-blue'}`}
                  />
                  <h3 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                    {section.title}
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    ({modelsForSection.length})
                  </span>
                </div>
                <button
                  onClick={() => handleAddGroup(section.type)}
                  className={`text-[10px] font-medium px-2 py-1.5 sm:py-0.5 rounded transition-all active:scale-95 ${accentClasses.button} ${!hasAny ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={!hasAny}
                >
                  {allSelected ? '− Remove All' : '+ Add All'}
                </button>
              </div>

              {/* Model list */}
              <div className="flex flex-col gap-1">
                {modelsForSection.map(model => (
                  <div
                    key={model.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, model.id)}
                    onClick={() => handleModelToggle(model.id)}
                    className={`group flex items-center gap-3 px-3 py-3 sm:py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/5 transition-all border border-transparent active:scale-95 ${accentClasses.border}`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${accentClasses.dot} opacity-60 group-hover:opacity-100 transition-opacity`}
                    />
                    <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                      {model.name}
                    </span>
                  </div>
                ))}
                {modelsForSection.length === 0 && (
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
      <div className="px-5 py-3 border-t border-slate-700/50 bg-slate-900/30">
        <p className="text-[10px] text-slate-500 text-center">
          Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[9px]">M</kbd> to toggle this panel
        </p>
      </div>
    </div>
  );
}
