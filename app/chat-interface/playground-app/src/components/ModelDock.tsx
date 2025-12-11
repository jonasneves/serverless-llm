import { Model } from '../types';

interface ModelDockProps {
  showDock: boolean;
  availableModels: Model[];
  handleDragStart: (e: React.DragEvent, modelId: string) => void;
  handleModelToggle: (modelId: string) => void;
  handleAddGroup: (type: 'local' | 'api') => void;
  dockRef: React.RefObject<HTMLDivElement>;
}

export default function ModelDock({ 
  showDock, 
  availableModels, 
  handleDragStart, 
  handleModelToggle, 
  handleAddGroup,
  dockRef
}: ModelDockProps) {
  return (
    <div 
      ref={dockRef}
      className="fixed left-6 top-24 bottom-24 w-64 rounded-2xl p-4 flex flex-col gap-6 z-[60] transition-all duration-300"
      style={{
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transform: showDock ? 'translateX(0)' : 'translateX(-150%)',
        opacity: showDock ? 1 : 0,
        pointerEvents: showDock ? 'auto' : 'none',
      }}
    >
      
      {/* Local Models Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-400 tracking-wider">LOCAL MODELS</h3>
          <button 
            onClick={() => handleAddGroup('local')}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            + ALL
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {availableModels.filter(m => m.type === 'local').map(model => (
            <div
              key={model.id}
              draggable
              onDragStart={(e) => handleDragStart(e, model.id)}
              onClick={() => handleModelToggle(model.id)}
              className="group flex items-center gap-3 p-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/5 transition-all border border-transparent hover:border-emerald-500/30"
            >
              <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] bg-emerald-500" />
              <span className="text-xs font-medium text-slate-300 group-hover:text-white">{model.name}</span>
            </div>
          ))}
          {availableModels.filter(m => m.type === 'local').length === 0 && (
            <div className="text-[10px] text-slate-600 italic px-2">All active</div>
          )}
        </div>
      </div>

      {/* API Models Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-400 tracking-wider">API MODELS</h3>
          <button 
            onClick={() => handleAddGroup('api')}
            className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
          >
            + ALL
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {availableModels.filter(m => m.type === 'api').map(model => (
            <div
              key={model.id}
              draggable
              onDragStart={(e) => handleDragStart(e, model.id)}
              onClick={() => handleModelToggle(model.id)}
              className="group flex items-center gap-3 p-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/5 transition-all border border-transparent hover:border-orange-500/30"
            >
              <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)] bg-orange-500" />
              <span className="text-xs font-medium text-slate-300 group-hover:text-white">{model.name}</span>
            </div>
          ))}
          {availableModels.filter(m => m.type === 'api').length === 0 && (
            <div className="text-[10px] text-slate-600 italic px-2">All active</div>
          )}
        </div>
      </div>
    </div>
  );
}
