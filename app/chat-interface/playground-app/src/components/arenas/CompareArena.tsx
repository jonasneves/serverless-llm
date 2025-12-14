import { useMemo } from 'react';
import type {
  CSSProperties,
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SetStateAction,
} from 'react';
import { LAYOUT } from '../../constants';
import { Model } from '../../types';
import Typewriter from '../Typewriter';
import StatusIndicator from '../StatusIndicator';
import ExecutionTimeDisplay, { ExecutionTimeData } from '../ExecutionTimeDisplay';
import { DragState } from '../../hooks/useCardReorder';
import { ArenaContextMenu } from './types';

interface CompareArenaProps {
  selectedModels: Model[];
  gridCols: number;
  speaking: Set<string>;
  selectedCardIds: Set<string>;
  setSelectedCardIds: Dispatch<SetStateAction<Set<string>>>;
  setActiveInspectorId: (id: string | null) => void;
  pinnedModels: Set<string>;
  executionTimes: Record<string, ExecutionTimeData>;
  failedModels: Set<string>;
  cardRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  handlePointerDown: (event: ReactPointerEvent, modelId: string) => void;
  dragState: DragState | null;
  handleModelToggle: (modelId: string) => void;
  setContextMenu: Dispatch<SetStateAction<ArenaContextMenu>>;
  suppressClickRef: MutableRefObject<boolean>;
  getTailSnippet: (text: string, maxChars?: number) => string;
}

const GRID_CARD_WIDTH = 256;
const GRID_CARD_HEIGHT = 200;

export function CompareArena({
  selectedModels,
  gridCols,
  speaking,
  selectedCardIds,
  setSelectedCardIds,
  setActiveInspectorId,
  pinnedModels,
  executionTimes,
  failedModels,
  cardRefs,
  handlePointerDown,
  dragState,
  handleModelToggle,
  setContextMenu,
  suppressClickRef,
  getTailSnippet,
}: CompareArenaProps) {
  const totalWidth = useMemo(
    () => (GRID_CARD_WIDTH + LAYOUT.gapX) * gridCols - LAYOUT.gapX,
    [gridCols],
  );

  return (
    <>
      {selectedModels.map((model, index) => {
        const isSpeaking = speaking.has(model.id);
        const isSelected = selectedCardIds.has(model.id);
        const hasError = failedModels.has(model.id);
        const isDone = !isSpeaking && !hasError && Boolean(executionTimes[model.id]?.endTime) && model.response.trim().length > 0;
        const statusState: 'idle' | 'responding' | 'done' | 'waiting' = hasError
          ? 'waiting'
          : isSpeaking
            ? 'responding'
            : isDone
              ? 'done'
              : 'idle';
        const statusLabel = hasError
          ? 'Error'
          : isSpeaking
            ? 'Responding'
            : isDone
              ? 'Done'
              : 'Ready';
        const processingColor = '#fbbf24';
        const errorColor = '#ef4444';
        const typeColor = model.type === 'local' ? '#10b981' : '#3b82f6';
        const effectiveColor = hasError ? errorColor : typeColor;
        const isProcessing = isSpeaking && !hasError;
        const baseBackground = 'rgba(30, 41, 59, 0.85)';
        const cardBackground = hasError
          ? `linear-gradient(135deg, ${errorColor}14, ${baseBackground})`
          : isProcessing
            ? `linear-gradient(135deg, ${processingColor}14, ${baseBackground})`
            : baseBackground;
        const cardBorder = hasError
          ? `1px solid ${errorColor}99`
          : isProcessing
            ? `1px solid ${processingColor}99`
            : isSelected
              ? `1px solid ${typeColor}d0`
              : '1px solid rgba(71, 85, 105, 0.5)';
        const cardShadow = hasError
          ? `0 0 24px ${errorColor}33, inset 0 1px 1px rgba(255,255,255,0.1)`
          : isProcessing
            ? `0 0 24px ${processingColor}33, inset 0 1px 1px rgba(255,255,255,0.1)`
            : isSelected
              ? `0 0 20px ${typeColor}30, inset 0 1px 1px rgba(255,255,255,0.1)`
              : '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)';

        const row = Math.floor(index / gridCols);
        const col = index % gridCols;
        const gridY = row * (GRID_CARD_HEIGHT + LAYOUT.gapY);
        const gridX = col * (GRID_CARD_WIDTH + LAYOUT.gapX) - totalWidth / 2 + GRID_CARD_WIDTH / 2;

        const isDragging = dragState?.activeId === model.id;
        const styleTransform = getTransform({
          dragState,
          modelId: model.id,
          gridX,
          gridY,
        });

        return (
          <div
            key={model.id}
            ref={(el) => {
              if (el) cardRefs.current.set(model.id, el);
              else cardRefs.current.delete(model.id);
            }}
            onPointerDown={(e) => handlePointerDown(e, model.id)}
            className="absolute"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                modelId: model.id
              });
            }}
            style={{
              transform: styleTransform,
              zIndex: isDragging ? 100 : isSelected ? 20 : isSpeaking ? 10 : 1,
              left: '50%',
              top: '0',
              transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0, 0.2, 1)',
            }}
          >
            <div
              data-card
              onClick={(e) => handleCardClick({
                e,
                modelId: model.id,
                suppressClickRef,
                selectedCardIds,
                setSelectedCardIds,
                pinnedModels,
                setActiveInspectorId,
              })}
              className={`relative cursor-grab active:cursor-grabbing card-hover ${isSelected ? 'card-selected' : ''} ${isSpeaking ? 'card-speaking' : ''}`}
              style={{
                background: cardBackground,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: cardBorder,
                boxShadow: cardShadow,
                transform: isSelected || isProcessing ? 'scale(1.05)' : 'scale(1)',
                width: `${GRID_CARD_WIDTH}px`,
                height: `${GRID_CARD_HEIGHT}px`,
                borderRadius: '12px',
                transition: 'transform 180ms ease-out, box-shadow 180ms ease-out, border-color 180ms ease-out, width 0.7s cubic-bezier(0.4, 0, 0.2, 1), height 0.7s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleModelToggle(model.id);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 transition-all opacity-0 z-50"
                style={{ opacity: isSelected ? 1 : undefined }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div style={GRID_CONTENT_STYLE}>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <StatusIndicator
                      state={statusState}
                      color={effectiveColor}
                      size={16}
                      label={statusLabel}
                    />
                    <span className="text-xs font-semibold text-slate-200 truncate">{model.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${model.type === 'local'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                        : 'bg-blue-500/10 text-blue-300 border border-blue-500/30'
                        }`}
                    >
                      {model.type === 'local' ? 'Local' : 'API'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 flex-1">
                  {renderCardContent({
                    model,
                    isSpeaking,
                    thinkingFallback: (
                      <span className="text-slate-500 italic">Thinking…</span>
                    ),
                    getTailSnippet,
                  })}
                </p>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50">
                  <ExecutionTimeDisplay times={executionTimes[model.id]} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function getTransform({
  dragState,
  modelId,
  gridX,
  gridY,
}: {
  dragState: DragState | null;
  modelId: string;
  gridX: number;
  gridY: number;
}) {
  if (dragState?.activeId === modelId) {
    const centerX = dragState.currX + dragState.offsetX;
    const centerY = dragState.currY + dragState.offsetY;
    const xRelative = centerX - (dragState.containerLeft + dragState.containerWidth / 2);
    const topY = (centerY - dragState.containerTop) - (dragState.cardHeight / 2);
    return `translate(calc(-50% + ${xRelative}px), ${topY}px)`;
  }

  return `translate(calc(-50% + ${gridX}px), ${gridY}px)`;
}

function handleCardClick({
  e,
  modelId,
  suppressClickRef,
  selectedCardIds,
  setSelectedCardIds,
  pinnedModels,
  setActiveInspectorId,
}: {
  e: ReactMouseEvent;
  modelId: string;
  suppressClickRef: MutableRefObject<boolean>;
  selectedCardIds: Set<string>;
  setSelectedCardIds: Dispatch<SetStateAction<Set<string>>>;
  pinnedModels: Set<string>;
  setActiveInspectorId: (id: string | null) => void;
}) {
  e.stopPropagation();
  if (suppressClickRef.current) {
    suppressClickRef.current = false;
    return;
  }
  const isMulti = e.metaKey || e.ctrlKey;
  if (isMulti) {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
    setActiveInspectorId(modelId);
  } else {
    const next = new Set([...selectedCardIds].filter(id => pinnedModels.has(id)));
    next.add(modelId);
    setSelectedCardIds(next);
    setActiveInspectorId(modelId);
  }
}

function renderCardContent({
  model,
  isSpeaking,
  thinkingFallback,
  getTailSnippet,
}: {
  model: Model;
  isSpeaking: boolean;
  thinkingFallback: ReactNode;
  getTailSnippet: (text: string, maxChars?: number) => string;
}) {
  if (model.statusMessage) {
    if (model.statusMessage.startsWith('<svg')) {
      return <span dangerouslySetInnerHTML={{ __html: model.statusMessage }} />;
    }
    return model.statusMessage;
  }

  if (isSpeaking) {
    if (model.response.trim().length > 0) {
      if (model.response.startsWith('<svg')) {
        return <span dangerouslySetInnerHTML={{ __html: model.response }} />;
      }
      return <Typewriter text={model.response} speed={20} />;
    }
    if (model.thinking && model.thinking.trim().length > 0) {
      return (
        <span>
          <span className="text-slate-500 italic">Thinking… </span>
          {getTailSnippet(model.thinking.trim(), 220)}
        </span>
      );
    }
    return thinkingFallback;
  }

  if (model.response.startsWith('<svg')) {
    return <span dangerouslySetInnerHTML={{ __html: model.response }} />;
  }
  return model.response;
}

const GRID_CONTENT_STYLE: CSSProperties = {
  padding: '16px',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  isolation: 'isolate',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'optimizeLegibility',
  opacity: 1,
  transition: 'opacity 0.3s ease-out',
};
