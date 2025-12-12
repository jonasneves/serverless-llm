import { Model } from '../types';

interface ModelDockProps {
  showDock: boolean;
  availableModels: Model[];
  allSelectedByType: Record<'local' | 'api', boolean>;
  totalModelsByType: Record<'local' | 'api', number>;
  handleDragStart: (e: React.DragEvent, modelId: string) => void;
  handleModelToggle: (modelId: string) => void;
  handleAddGroup: (type: 'local' | 'api') => void;
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
      type: 'local' as const,
      title: 'LOCAL MODELS',
      addAllClass: 'text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors',
      itemBorderHover: 'hover:border-emerald-500/30',
      dotClass: 'w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] bg-emerald-500',
    },
    {
      type: 'api' as const,
      title: 'API MODELS',
      addAllClass: 'text-[10px] text-orange-400 hover:text-orange-300 transition-colors',
      itemBorderHover: 'hover:border-orange-500/30',
      dotClass: 'w-2 h-2 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)] bg-orange-500',
    },
  ];

  return (
    <div 
      ref={dockRef}
      data-no-arena-scroll
      className="dock-scroll fixed left-3 top-20 bottom-20 w-[85vw] sm:left-6 sm:top-24 sm:bottom-24 sm:w-64 rounded-2xl p-4 flex flex-col gap-6 z-[60] transition-all duration-300 overflow-y-auto pr-1"
      style={{
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transform: showDock ? 'translateX(0)' : 'translateX(-150%)',
        opacity: showDock ? 1 : 0,
        pointerEvents: showDock ? 'auto' : 'none',
      }}
    >
      {sections.map(section => {
        const modelsForSection = availableModels.filter(m => m.type === section.type);
        const allSelected = allSelectedByType[section.type];
        const hasAny = totalModelsByType[section.type] > 0;
        return (
          <div key={section.type} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 tracking-wider">{section.title}</h3>
              <button
                onClick={() => handleAddGroup(section.type)}
                className={`${section.addAllClass} ${!hasAny ? 'opacity-40 cursor-not-allowed' : ''}`}
                disabled={!hasAny}
              >
                {allSelected ? '− ALL' : '+ ALL'}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {modelsForSection.map(model => (
                <div
                  key={model.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, model.id)}
                  onClick={() => handleModelToggle(model.id)}
                  className={`group flex items-center gap-3 p-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/5 transition-all border border-transparent ${section.itemBorderHover}`}
                >
                  <div className={section.dotClass} />
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white">{model.name}</span>
                </div>
              ))}
              {modelsForSection.length === 0 && (
                <div className="text-[10px] text-slate-600 italic px-2">All active</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
