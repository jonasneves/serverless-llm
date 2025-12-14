import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
} from 'react';
import Typewriter from '../Typewriter';
import StatusIndicator from '../StatusIndicator';
import ExecutionTimeDisplay, { ExecutionTimeData } from '../ExecutionTimeDisplay';
import { DragState } from '../../hooks/useCardReorder';
import { Model, Mode } from '../../types';
import { ArenaContextMenu } from './types';

interface CircleArenaProps {
  mode: Extract<Mode, 'council' | 'roundtable'>;
  selectedModels: Model[];
  layoutRadius: number;
  getCirclePosition: (index: number, total: number, currentMode: Mode, radius: number) => { x: number; y: number; angle: number };
  dragState: DragState | null;
  handlePointerDown: (event: ReactPointerEvent, modelId: string) => void;
  speaking: Set<string>;
  hoveredCard: string | null;
  setHoveredCard: (value: string | null) => void;
  selectedCardIds: Set<string>;
  setSelectedCardIds: Dispatch<SetStateAction<Set<string>>>;
  setActiveInspectorId: (id: string | null) => void;
  pinnedModels: Set<string>;
  handleModelToggle: (modelId: string) => void;
  executionTimes: Record<string, ExecutionTimeData>;
  failedModels: Set<string>;
  cardRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  setContextMenu: Dispatch<SetStateAction<ArenaContextMenu>>;
  suppressClickRef: MutableRefObject<boolean>;
  moderatorModel?: Model;
  moderatorId: string;
  orchestratorTransform: string;
  orchestratorStatus: 'idle' | 'responding' | 'done' | 'waiting';
  orchestratorPhaseLabel: string;
  moderatorSynthesis: string;
  isSynthesizing: boolean;
  isGenerating: boolean;
  phaseLabel: string | null;
  getTailSnippet: (text: string, maxChars?: number) => string;
}

type CardClickArgs = {
  e: ReactMouseEvent;
  modelId: string;
  suppressClickRef: MutableRefObject<boolean>;
  selectedCardIds: Set<string>;
  setSelectedCardIds: Dispatch<SetStateAction<Set<string>>>;
  pinnedModels: Set<string>;
  setActiveInspectorId: (id: string | null) => void;
};

function CircleArena({
  mode,
  selectedModels,
  layoutRadius,
  getCirclePosition,
  dragState,
  handlePointerDown,
  speaking,
  hoveredCard,
  setHoveredCard,
  selectedCardIds,
  setSelectedCardIds,
  setActiveInspectorId,
  pinnedModels,
  handleModelToggle,
  executionTimes,
  failedModels,
  cardRefs,
  setContextMenu,
  suppressClickRef,
  moderatorModel,
  moderatorId,
  orchestratorTransform,
  orchestratorStatus,
  orchestratorPhaseLabel,
  moderatorSynthesis,
  isSynthesizing,
  isGenerating,
  phaseLabel,
  getTailSnippet,
}: CircleArenaProps) {
  const orchestratorYOffset = mode === 'council' ? layoutRadius - 64 : 0;

  return (
    <>
      {selectedModels.map((model, index) => {
        const circlePos = getCirclePosition(index, selectedModels.length, mode, layoutRadius);
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

        const isDragging = dragState?.activeId === model.id;
        const styleTransform = getCircleTransform({
          dragState,
          modelId: model.id,
          defaultX: circlePos.x,
          defaultY: circlePos.y,
        });

        const lineSize = Math.max(800, layoutRadius * 2 + 600);
        const lineCenter = lineSize / 2;
        const lineX1 = lineCenter;
        const lineY1 = lineCenter;
        const lineX2 = lineCenter + (0 - circlePos.x);
        const lineY2 = lineCenter + (orchestratorYOffset - circlePos.y);

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
              zIndex: isDragging || hoveredCard === model.id ? 100 : isSelected ? 20 : isSpeaking ? 10 : 1,
              left: '50%',
              top: '50%',
              transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0, 0.2, 1)',
            }}
          >
            {isSpeaking && !hasError && (
              <svg
                className="absolute pointer-events-none"
                style={{
                  width: `${lineSize}px`,
                  height: `${lineSize}px`,
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: -1
                }}
                viewBox={`0 0 ${lineSize} ${lineSize}`}
              >
                <defs>
                  <linearGradient
                    id={`grad-${model.id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={lineX1}
                    y1={lineY1}
                    x2={lineX2}
                    y2={lineY2}
                  >
                    <stop offset="0%" stopColor={processingColor} stopOpacity="0.45" />
                    <stop offset="100%" stopColor={processingColor} stopOpacity="0.12" />
                  </linearGradient>
                </defs>
                <line
                  x1={lineX1}
                  y1={lineY1}
                  x2={lineX2}
                  y2={lineY2}
                  stroke={`url(#grad-${model.id})`}
                  strokeWidth="2"
                  strokeDasharray="6,4"
                  strokeLinecap="round"
                  className="animate-flow"
                />
              </svg>
            )}

            <div
              data-card
              onClick={(e) => handleCircleCardClick({
                e,
                modelId: model.id,
                suppressClickRef,
                selectedCardIds,
                setSelectedCardIds,
                pinnedModels,
                setActiveInspectorId,
              })}
              onMouseEnter={() => setHoveredCard(model.id)}
              onMouseLeave={() => setHoveredCard(null)}
              className={`relative cursor-grab active:cursor-grabbing card-hover rounded-full ${isSelected ? 'card-selected' : ''} ${isSpeaking ? 'card-speaking' : ''}`}
              style={{
                background: cardBackground,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: cardBorder,
                boxShadow: cardShadow,
                transform: isSelected || isProcessing ? 'scale(1.05)' : 'scale(1)',
                width: '96px',
                height: '96px',
                borderRadius: '50%',
                transition: 'transform 180ms ease-out, box-shadow 180ms ease-out, border-color 180ms ease-out',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleModelToggle(model.id);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 transition-all opacity-0 z-50"
                style={{ opacity: isSelected || hoveredCard === model.id ? 1 : undefined }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-2">
                  <div className="text-[10px] font-semibold text-slate-200 leading-tight">{model.name}</div>
                  <div className="flex items-center justify-center mt-3">
                    <StatusIndicator state={statusState} color={effectiveColor} size={14} />
                  </div>
                </div>
              </div>
            </div>

            {hoveredCard === model.id && (
              <div
                data-card
                onClick={(e) => e.stopPropagation()}
                className="absolute w-64 max-w-[calc(100vw-2rem)] p-4 rounded-xl transition-all duration-300"
                style={{
                  top: circlePos.y > 0 ? 'auto' : '100%',
                  bottom: circlePos.y > 0 ? '100%' : 'auto',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: circlePos.y > 0 ? 0 : '12px',
                  marginBottom: circlePos.y > 0 ? '12px' : 0,
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${effectiveColor}40`,
                  boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 20px ${effectiveColor}15`,
                  zIndex: 200,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: effectiveColor }} />
                  <span className="text-xs font-semibold text-slate-300">{model.name}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                  {renderPreviewContent({ model, isSpeaking, getTailSnippet })}
                </p>
                <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-700/50">
                  <ExecutionTimeDisplay times={executionTimes[model.id]} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {moderatorModel && (
        <div
          data-card
          className="absolute z-20 transition-all duration-700 ease-out cursor-pointer"
          style={{
            opacity: 1,
            transform: orchestratorTransform,
            left: '50%',
            top: mode === 'council' ? `calc(50% + ${layoutRadius}px - 64px)` : '50%',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (moderatorId) {
              setSelectedCardIds(new Set([moderatorId]));
              setActiveInspectorId(moderatorId);
            }
          }}
          onMouseEnter={() => setHoveredCard('moderator')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{
                background: `radial-gradient(circle, ${moderatorModel.color}20 0%, transparent 70%)`,
                transform: 'scale(2)',
                filter: 'blur(20px)'
              }}
            />

            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(16px)',
                border: `2px solid ${moderatorModel.color}60`,
                boxShadow: `0 0 40px ${moderatorModel.color}30, inset 0 1px 1px rgba(255,255,255,0.1)`
              }}
            >
              <div
                className="absolute inset-[-4px] rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, transparent, ${moderatorModel.color}60, transparent)`,
                  animation: 'spin 4s linear infinite'
                }}
              />
              <div className="absolute inset-[2px] rounded-full" style={{ background: 'rgba(15, 23, 42, 0.95)' }} />

              <div className="relative text-center z-10 flex flex-col items-center gap-1">
                <div className="text-[10px] font-semibold text-slate-200 leading-tight">
                  {moderatorModel.name}
                </div>
                <StatusIndicator
                  state={orchestratorStatus}
                  color={moderatorModel.color}
                  size={14}
                />
              </div>
            </div>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-max max-w-[200px]" style={{ top: 'calc(100% + 12px)' }}>
            <span className="text-[10px] text-slate-500">{orchestratorPhaseLabel}</span>
          </div>

          {hoveredCard === 'moderator' && (
            <div
              data-card
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] p-4 rounded-xl z-[200] transition-all duration-300"
              style={{
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(16px)',
                border: `1px solid ${moderatorModel.color}40`,
                boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 30px ${moderatorModel.color}20`
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Orchestrator</div>
                <span className="text-xs text-slate-500">·</span>
                <span className="text-xs font-medium text-slate-300">{moderatorModel.name}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {renderModeratorContent({
                  moderatorSynthesis,
                  isSynthesizing,
                  moderatorId,
                  speaking,
                  phaseLabel,
                  isGenerating,
                  getTailSnippet,
                })}
              </p>
            </div>
          )}
        </div>
      )}

      <svg
        className="absolute pointer-events-none transition-opacity duration-700"
        style={{
          width: '1000px',
          height: '1000px',
          opacity: 0.2
        }}
      >
        <circle
          cx="500"
          cy="500"
          r={layoutRadius}
          fill="none"
          stroke="url(#circleGrad)"
          strokeWidth="1"
          strokeDasharray="8,4"
        />
        <defs>
          <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>
    </>
  );
}

export function CouncilArena(props: Omit<CircleArenaProps, 'mode'>) {
  return <CircleArena {...props} mode="council" />;
}

export function RoundtableArena(props: Omit<CircleArenaProps, 'mode'>) {
  return <CircleArena {...props} mode="roundtable" />;
}

function getCircleTransform({
  dragState,
  modelId,
  defaultX,
  defaultY,
}: {
  dragState: DragState | null;
  modelId: string;
  defaultX: number;
  defaultY: number;
}) {
  if (dragState?.activeId === modelId) {
    const centerX = dragState.currX + dragState.offsetX;
    const centerY = dragState.currY + dragState.offsetY;
    const xRelative = centerX - (dragState.containerLeft + dragState.containerWidth / 2);
    const yRelative = centerY - (dragState.containerTop + dragState.containerHeight / 2);
    return `translate(calc(-50% + ${xRelative}px), calc(-50% + ${yRelative}px))`;
  }
  return `translate(calc(-50% + ${defaultX}px), calc(-50% + ${defaultY}px))`;
}

function handleCircleCardClick(args: CardClickArgs) {
  const {
    e,
    modelId,
    suppressClickRef,
    selectedCardIds,
    setSelectedCardIds,
    pinnedModels,
    setActiveInspectorId,
  } = args;

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

function renderPreviewContent({
  model,
  isSpeaking,
  getTailSnippet,
}: {
  model: Model;
  isSpeaking: boolean;
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
          {getTailSnippet(model.thinking.trim(), 280)}
        </span>
      );
    }
    return <span className="text-slate-500 italic">Thinking…</span>;
  }

  if (model.response) {
    if (model.response.startsWith('<svg')) {
      return <span dangerouslySetInnerHTML={{ __html: model.response }} />;
    }
    return getTailSnippet(model.response);
  }

  return <span className="text-slate-500 italic">No response yet.</span>;
}

function renderModeratorContent({
  moderatorSynthesis,
  isSynthesizing,
  moderatorId,
  speaking,
  phaseLabel,
  isGenerating,
  getTailSnippet,
}: {
  moderatorSynthesis: string;
  isSynthesizing: boolean;
  moderatorId: string;
  speaking: Set<string>;
  phaseLabel: string | null;
  isGenerating: boolean;
  getTailSnippet: (text: string, maxChars?: number) => string;
}) {
  if (moderatorSynthesis) {
    if (isSynthesizing && moderatorId && speaking.has(moderatorId)) {
      return <Typewriter text={moderatorSynthesis} speed={20} />;
    }
    return getTailSnippet(moderatorSynthesis);
  }

  if (isSynthesizing) {
    return <span className="text-slate-500 italic">Synthesizing responses...</span>;
  }

  if (isGenerating) {
    if (phaseLabel && phaseLabel.startsWith('<svg')) {
      return <span className="text-slate-500 italic" dangerouslySetInnerHTML={{ __html: phaseLabel }} />;
    }
    return (
      <span className="text-slate-500 italic">
        {phaseLabel === 'Stage 1 · Responses' ? 'Waiting for model responses...' : (phaseLabel || 'Orchestrating...')}
      </span>
    );
  }

  return <span className="text-slate-500 italic">Send a prompt to see the synthesis.</span>;
}
