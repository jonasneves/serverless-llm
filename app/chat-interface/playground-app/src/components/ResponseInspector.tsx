import { useMemo } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import Typewriter from './Typewriter';

interface ResponseInspectorProps {
  models: Model[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  speaking: Set<string>;
}

export default function ResponseInspector({
  models,
  activeId,
  onSelect,
  onClose,
  speaking,
}: ResponseInspectorProps) {
  const activeModel = useMemo(
    () => models.find(m => m.id === activeId),
    [models, activeId],
  );

  if (!activeModel) return null;

  const isStreaming = speaking.has(activeModel.id);

  return (
    <aside
      className="fixed right-6 top-24 bottom-24 w-[420px] max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-700/60 bg-slate-900/85 backdrop-blur-xl shadow-2xl z-[80] flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/60">
        <div className="flex gap-1 overflow-x-auto">
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`px-2 py-1 text-[11px] rounded-md whitespace-nowrap transition-colors ${
                m.id === activeId
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: activeModel.color }} />
        <div className="text-sm font-semibold text-slate-100">{activeModel.name}</div>
        {isStreaming && (
          <div className="text-xs text-slate-500 ml-auto">Streaming…</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 markdown-content">
        {isStreaming ? (
          <p className="text-sm text-slate-300 whitespace-pre-wrap">
            <Typewriter text={activeModel.response} speed={20} />
          </p>
        ) : activeModel.response ? (
          <FormattedContent text={activeModel.response} />
        ) : (
          <div className="text-sm text-slate-500 italic">No response yet.</div>
        )}
      </div>
    </aside>
  );
}

