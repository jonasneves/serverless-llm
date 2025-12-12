import { useMemo, useState, useRef } from 'react';
import { Model, Mode } from '../types';
import FormattedContent from './FormattedContent';
import Typewriter from './Typewriter';

interface ResponseInspectorProps {
  models: Model[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  speaking: Set<string>;
  mode: Mode;
  moderatorId: string;
  councilAggregateRankings: Array<{
    model_id: string;
    model_name: string;
    average_rank: number;
    votes_count: number;
  }> | null;
  discussionTurnsByModel: Record<string, Array<{
    turn_number: number;
    response: string;
    evaluation?: any;
  }>>;
  pinned?: boolean;
  onTogglePin?: () => void;
  position?: 'left' | 'right';
  onTogglePosition?: () => void;
}

export default function ResponseInspector({
  models,
  activeId,
  onSelect,
  onClose,
  speaking,
  mode,
  moderatorId,
  councilAggregateRankings,
  discussionTurnsByModel,
  pinned = false,
  onTogglePin,
  position = 'right',
  onTogglePosition,
}: ResponseInspectorProps) {
  const activeModel = useMemo(
    () => models.find(m => m.id === activeId),
    [models, activeId],
  );

  if (!activeModel) return null;

  const isStreaming = speaking.has(activeModel.id);
  const showCouncilStats = mode === 'council' && activeModel.id === moderatorId && councilAggregateRankings && councilAggregateRankings.length > 0;
  const turnsForActive = mode === 'roundtable' ? (discussionTurnsByModel[activeModel.id] || []) : [];

  /* Drag to toggle side logic */
  const [dragOffset, setDragOffset] = useState(0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    // Only allow left click
    if (e.button !== 0) return;
    // Don't drag if clicking buttons
    if ((e.target as HTMLElement).closest('button')) return;

    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    (e.target as Element).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handleHeaderPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    setDragOffset(delta);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Check if we dragged far enough to switch sides
    const delta = e.clientX - startXRef.current;

    let shouldToggle = false;
    if (position === 'right' && delta < -200) {
      shouldToggle = true;
    } else if (position === 'left' && delta > 200) {
      shouldToggle = true;
    }

    if (shouldToggle && onTogglePosition) {
      onTogglePosition();
    }

    setDragOffset(0);
  };

  return (
    <aside
      data-no-arena-scroll
      className={`fixed top-20 bottom-20 sm:top-24 sm:bottom-24 sm:w-[420px] max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-700/60 bg-slate-900/85 backdrop-blur-xl shadow-2xl z-[80] flex flex-col ${position === 'left' ? 'left-3 sm:left-6 right-auto' : 'right-3 sm:right-6 left-auto'
        }`}
      onClick={(e) => e.stopPropagation()}
      style={{
        transform: dragOffset ? `translateX(${dragOffset}px)` : 'none',
        transition: isDraggingRef.current ? 'none' : 'transform 300ms cubic-bezier(0.2, 0, 0.2, 1), left 300ms, right 300ms',
        cursor: isDraggingRef.current ? 'grabbing' : 'default',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/60 cursor-grab active:cursor-grabbing"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
      >
        <div className="inspector-tabs flex gap-1 overflow-x-auto pb-1 no-scrollbar" onPointerDown={(e) => e.stopPropagation()}>
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`px-2 py-1 text-[11px] rounded-md whitespace-nowrap transition-colors ${m.id === activeId
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {onTogglePin && (
            <button
              onClick={onTogglePin}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${pinned
                ? 'text-amber-400 bg-amber-400/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              aria-label={pinned ? 'Unpin panel' : 'Pin panel'}
              title={pinned ? 'Unpin panel' : 'Pin panel'}
            >
              <svg className="w-4 h-4" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: activeModel.type === 'local' ? '#10b981' : '#3b82f6' }} />
        <div className="text-sm font-semibold text-slate-100">{activeModel.name}</div>
        {isStreaming && (
          <div className="text-xs text-slate-500 ml-auto">Streaming…</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 markdown-content">
        {showCouncilStats && (
          <details className="mb-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-300">
              Anonymous rankings
            </summary>
            <div className="px-3 pb-3 pt-1 text-xs text-slate-400 space-y-1">
              {councilAggregateRankings!.map((r, idx) => (
                <div key={r.model_id} className="flex items-center justify-between gap-2">
                  <div className="truncate">
                    {idx + 1}. {r.model_name}
                  </div>
                  <div className="shrink-0 text-slate-500">
                    {r.votes_count} votes · avg {r.average_rank}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {turnsForActive.length > 0 && (
          <details className="mb-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-300">
              Turn evaluations
            </summary>
            <div className="px-3 pb-3 pt-1 text-xs text-slate-400 space-y-2">
              {turnsForActive.map((t, idx) => {
                const evaluation = t.evaluation || {};
                const quality = typeof evaluation.quality_score === 'number' ? evaluation.quality_score : null;
                const relevance = typeof evaluation.relevance_score === 'number' ? evaluation.relevance_score : null;
                const alignment = typeof evaluation.expertise_alignment === 'number' ? evaluation.expertise_alignment : null;
                const confidence = evaluation.confidence_assessment;
                return (
                  <div key={`${t.turn_number}-${idx}`} className="space-y-1">
                    <div className="text-slate-300 font-semibold text-[11px]">
                      Turn {t.turn_number + 1}
                    </div>
                    {quality != null || relevance != null || alignment != null || confidence ? (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        {quality != null && <div>Quality: {(quality * 100).toFixed(0)}%</div>}
                        {relevance != null && <div>Relevance: {(relevance * 100).toFixed(0)}%</div>}
                        {alignment != null && <div>Alignment: {(alignment * 100).toFixed(0)}%</div>}
                        {confidence && <div>Confidence: {confidence}</div>}
                      </div>
                    ) : (
                      <div className="text-slate-500 italic text-[11px]">No evaluation.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {isStreaming ? (
          <p className="text-sm text-slate-300 whitespace-pre-wrap">
            <Typewriter text={activeModel.response} speed={20} />
          </p>
        ) : activeModel.response ? (
          <FormattedContent text={activeModel.response} thinkingText={activeModel.thinking} />
        ) : (
          <div className="text-sm text-slate-500 italic">No response yet.</div>
        )}
      </div>
    </aside>
  );
}
