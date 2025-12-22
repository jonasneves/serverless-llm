import {
  useState,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import { LAYOUT } from '../../constants';
import type { Model, Mode, Position } from '../../types';
import StatusIndicator from '../StatusIndicator';
import ExecutionTimeDisplay, { ExecutionTimeData } from '../ExecutionTimeDisplay';
import Typewriter from '../Typewriter';
import { DragState } from '../../hooks/useCardReorder';
import { ArenaContextMenu } from './types';
import { Zap } from 'lucide-react';

type OrchestratorAutoScope = 'all' | 'local' | 'api';

interface ArenaCanvasProps {
  mode: Mode;
  selectedModels: Model[];
  gridCols: number;
  speaking: Set<string>;
  selectedCardIds: Set<string>;
  setSelectedCardIds: Dispatch<SetStateAction<Set<string>>>;
  executionTimes: Record<string, ExecutionTimeData>;
  failedModels: Set<string>;
  cardRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  handlePointerDown: (event: ReactPointerEvent, modelId: string) => void;
  dragState: DragState | null;
  handleModelToggle: (modelId: string) => void;
  setContextMenu: Dispatch<SetStateAction<ArenaContextMenu>>;
  suppressClickRef: MutableRefObject<{ card: boolean; background: boolean }>;
  getTailSnippet: (text: string, maxChars?: number) => string;
  hoveredCard: string | null;
  setHoveredCard: (value: string | null) => void;
  layoutRadius: number;
  getCirclePosition: (index: number, total: number, currentMode: Mode, radius: number) => Position;
  moderatorModel?: Model;
  moderatorId: string;
  orchestratorTransform: string;
  orchestratorStatus: 'idle' | 'responding' | 'done' | 'waiting';
  orchestratorPhaseLabel: string;
  moderatorSynthesis: string;
  isSynthesizing: boolean;
  isGenerating: boolean;
  phaseLabel: string | null;
  linesTransitioning: boolean;
  lastSelectedCardRef: MutableRefObject<string | null>;
  orchestratorAutoMode: boolean;
  orchestratorAutoScope: OrchestratorAutoScope;
  showOrchestratorMenu: boolean;
  setShowOrchestratorMenu: Dispatch<SetStateAction<boolean>>;
  setOrchestratorAutoMode: Dispatch<SetStateAction<boolean>>;
  setOrchestratorAutoScope: Dispatch<SetStateAction<OrchestratorAutoScope>>;
  orchestratorMenuRef: MutableRefObject<HTMLDivElement | null>;
  availableModels: Model[];
  setModerator: (id: string) => void;
  councilWinnerId?: string; // ID of the top-ranked model in Council mode
}

const GRID_CARD_WIDTH = 256;
const GRID_CARD_HEIGHT = 200;
const CIRCLE_CARD_SIZE = 96;

export function ArenaCanvas(props: ArenaCanvasProps) {
  const {
    mode,
    selectedModels,
    gridCols,
    speaking,
    selectedCardIds,
    setSelectedCardIds,
    executionTimes,
    failedModels,
    cardRefs,
    handlePointerDown,
    dragState,
    setContextMenu,
    suppressClickRef,
    getTailSnippet,
    hoveredCard,
    setHoveredCard,
    layoutRadius,
    getCirclePosition,
    moderatorModel,
    moderatorId,
    orchestratorTransform,
    orchestratorStatus,
    orchestratorPhaseLabel,
    moderatorSynthesis,
    isSynthesizing,
    isGenerating,
    phaseLabel,
    linesTransitioning,
    lastSelectedCardRef,
    orchestratorAutoMode,
    orchestratorAutoScope,
    showOrchestratorMenu,
    setShowOrchestratorMenu,
    setOrchestratorAutoMode,
    setOrchestratorAutoScope,
    orchestratorMenuRef,
    availableModels,
    setModerator,
    councilWinnerId,
  } = props;

  const isCircleMode = mode !== 'compare';
  const orchestratorYOffset = mode === 'council' ? layoutRadius - 64 : 0;
  const orchestratorStatusLabel =
    orchestratorStatus === 'responding'
      ? 'Responding'
      : orchestratorStatus === 'waiting'
        ? 'Waiting'
        : orchestratorStatus === 'done'
          ? 'Done'
          : 'Ready';

  // Store menu click position for portal rendering
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showOrchestratorMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (orchestratorMenuRef.current && !orchestratorMenuRef.current.contains(e.target as Node)) {
        setShowOrchestratorMenu(false);
        setMenuPosition(null);
      }
    };

    // Use capture phase to ensure we catch the click before it propagates
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [showOrchestratorMenu, orchestratorMenuRef, setShowOrchestratorMenu]);

  return (
    <>
      {selectedModels.map((model, index) => {
        const circlePos = getCirclePosition(index, selectedModels.length, mode, layoutRadius);
        const gridLayout = getGridLayout(index, gridCols);

        const isSpeaking = speaking.has(model.id);
        const isSelected = selectedCardIds.has(model.id);
        const hasError = failedModels.has(model.id);
        const isDone = !isSpeaking && !hasError && Boolean(executionTimes[model.id]?.endTime) && model.response.trim().length > 0;
        // Show "waiting" for models in a roundtable session that haven't started their turn yet
        const isWaiting = !isSpeaking && !isDone && !hasError && isGenerating && mode === 'roundtable';
        const statusState: 'idle' | 'responding' | 'done' | 'waiting' | 'error' = hasError
          ? 'error'
          : isSpeaking
            ? 'responding'
            : isDone
              ? 'done'
              : isWaiting
                ? 'waiting'
                : 'idle';
        const statusLabel = hasError
          ? 'Error'
          : isSpeaking
            ? 'Responding'
            : isDone
              ? 'Done'
              : isWaiting
                ? 'Waiting'
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

        const styleTransform = getCardTransform({
          mode,
          gridX: gridLayout.gridX,
          gridY: gridLayout.gridY,
          circleX: circlePos.x,
          circleY: circlePos.y,
          dragState,
          modelId: model.id,
        });

        const isHovered = hoveredCard === model.id;
        const width = isCircleMode ? CIRCLE_CARD_SIZE : GRID_CARD_WIDTH;
        const height = isCircleMode ? CIRCLE_CARD_SIZE : GRID_CARD_HEIGHT;

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
              zIndex: isCircleMode
                ? (isHovered ? 300 : isSelected ? 40 : isSpeaking ? 15 : 5)
                : isSelected
                  ? 20
                  : isSpeaking
                    ? 10
                    : 1,
              left: '50%',
              top: isCircleMode ? '50%' : '0',
              transition: dragState?.activeId === model.id ? 'none' : 'transform 300ms cubic-bezier(0.2, 0, 0.2, 1)',
            }}
          >
            {isCircleMode && isSpeaking && !hasError && !linesTransitioning && (
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
                  className="animate-flow arena-link"
                />
              </svg>
            )}

            <div
              data-card
              onClick={(e) => handleCardClick({
                e,
                modelId: model.id,
                suppressClickRef,
                setSelectedCardIds,
                selectedModels,
                lastSelectedCardRef,
              })}
              onMouseEnter={() => isCircleMode && setHoveredCard(model.id)}
              onMouseLeave={() => isCircleMode && setHoveredCard(null)}
              className={`relative cursor-grab active:cursor-grabbing card-hover ${isCircleMode ? 'rounded-full' : ''} ${isSelected ? 'card-selected' : ''} ${isSpeaking ? 'card-speaking' : ''}`}
              style={{
                background: cardBackground,
                backdropFilter: isCircleMode ? undefined : 'blur(8px)',
                WebkitBackdropFilter: isCircleMode ? undefined : 'blur(8px)',
                border: cardBorder,
                boxShadow: cardShadow,
                transform: isSelected || isProcessing ? 'scale(1.05)' : 'scale(1)',
                width: `${width}px`,
                height: `${height}px`,
                borderRadius: isCircleMode ? '50%' : '12px',
                transition: 'transform 180ms ease-out, box-shadow 180ms ease-out, border-color 180ms ease-out, width 0.7s cubic-bezier(0.4, 0, 0.2, 1), height 0.7s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {!isCircleMode && (
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
              )}

              {isCircleMode && (
                <div className="absolute inset-0 flex items-center justify-center text-center" style={{ transition: 'opacity 0.3s ease-out' }}>
                  <div className="absolute inset-[3px] rounded-full border border-white/5" style={{ boxShadow: `inset 0 0 20px ${effectiveColor}15` }} />
                  <div
                    className="absolute inset-[-6px] rounded-full opacity-60"
                    style={{
                      background: `radial-gradient(circle, ${effectiveColor}22 0%, transparent 65%)`,
                      filter: 'blur(10px)'
                    }}
                  />
                  <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 px-3">
                    <div className="text-[7px] tracking-[0.32em] text-slate-400 uppercase">{statusLabel}</div>
                    <div className="text-[10px] font-semibold text-slate-100 leading-tight">{model.name}</div>
                    <StatusIndicator state={statusState} color={effectiveColor} size={12} />
                  </div>
                </div>
              )}

            </div>

            {/* Persona Badge - Bottom Center */}
            {mode === 'personality' && isCircleMode && model.personaEmoji && (
              <div
                className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none select-none"
                style={{
                  bottom: '-12px',
                  fontSize: '20px',
                  zIndex: 100,
                  transition: 'transform 180ms ease-out',
                  transform: isSpeaking ? 'scale(1.15)' : 'scale(1)',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5)) drop-shadow(0 0 8px rgba(0,0,0,0.3))',
                }}
                title={model.personaName ? `${model.personaName} - ${model.personaTrait}` : 'Persona'}
              >
                {model.personaEmoji}
              </div>
            )}

            {/* Council Winner Badge - Bottom Center */}
            {mode === 'council' && isCircleMode && councilWinnerId === model.id && !isGenerating && !isSynthesizing && (
              <div
                className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none select-none"
                style={{
                  bottom: '-12px',
                  fontSize: '20px',
                  zIndex: 100,
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5)) drop-shadow(0 0 12px rgba(251, 191, 36, 0.4))',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
                title="Top Ranked Response"
              >
                🏆
              </div>
            )}

            {isCircleMode && hoveredCard === model.id && (
              <div
                data-card
                onClick={(e) => e.stopPropagation()}
                className="absolute w-64 max-w-[calc(100vw-2rem)] p-4 rounded-xl transition-all duration-300 z-[220]"
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
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: effectiveColor }} />
                  <span className="text-xs font-semibold text-slate-300">{model.name}</span>
                </div>
                {mode === 'personality' && model.personaEmoji && model.personaName && (
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700/50">
                    <span className="text-base">{model.personaEmoji}</span>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-blue-400">{model.personaName}</div>
                      {model.personaTrait && (
                        <div className="text-[10px] text-slate-500">{model.personaTrait}</div>
                      )}
                    </div>
                  </div>
                )}
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

      {mode !== 'compare' && moderatorModel && (
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
              lastSelectedCardRef.current = moderatorId;
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (showOrchestratorMenu) {
              setShowOrchestratorMenu(false);
              setMenuPosition(null);
            } else {
              setMenuPosition({ x: e.clientX, y: e.clientY });
              setShowOrchestratorMenu(true);
            }
          }}
          onMouseEnter={() => setHoveredCard('moderator')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="relative flex items-center justify-center" style={{ width: `${CIRCLE_CARD_SIZE}px`, height: `${CIRCLE_CARD_SIZE}px` }}>
            {/* Use yellow only when orchestrator is actively synthesizing (not just waiting) */}
            {(() => {
              const isWorking = orchestratorStatus === 'responding';
              const activeColor = isWorking ? '#fbbf24' : moderatorModel.color;
              return (
                <>
                  <div
                    className="absolute inset-0 rounded-full animate-pulse"
                    style={{
                      background: `radial-gradient(circle, ${activeColor}20 0%, transparent 70%)`,
                      transform: 'scale(2.2)',
                      filter: 'blur(18px)'
                    }}
                  />

                  <div
                    className="relative rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      width: `${CIRCLE_CARD_SIZE}px`,
                      height: `${CIRCLE_CARD_SIZE}px`,
                      background: isWorking
                        ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(15, 23, 42, 0.9))'
                        : 'rgba(15, 23, 42, 0.9)',
                      backdropFilter: 'blur(16px)',
                      border: `2px solid ${activeColor}${isWorking ? '99' : '60'}`,
                      boxShadow: `0 0 36px ${activeColor}${isWorking ? '40' : '28'}, inset 0 1px 1px rgba(255,255,255,0.1)`
                    }}
                  >
                    <div
                      className="absolute inset-[-4px] rounded-full"
                      style={{
                        background: `conic-gradient(from 0deg, transparent, ${activeColor}60, transparent)`,
                        animation: 'spin 4s linear infinite'
                      }}
                    />
                    <div className="absolute inset-[2px] rounded-full" style={{ background: 'rgba(15, 23, 42, 0.96)' }} />

                    <div className="relative text-center z-10 flex flex-col items-center gap-1.5 px-3">
                      <div className="text-[7px] tracking-[0.32em] text-slate-400 uppercase">{orchestratorStatusLabel}</div>
                      <div className="text-[10px] font-semibold text-slate-100 leading-tight">
                        {moderatorModel.name}
                      </div>
                      <StatusIndicator
                        state={orchestratorStatus}
                        color={activeColor}
                        size={12}
                      />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-max max-w-[200px]" style={{ top: 'calc(100% + 12px)' }}>
            <span className="text-[10px] text-slate-500">{orchestratorPhaseLabel}</span>
          </div>

          {hoveredCard === 'moderator' && !showOrchestratorMenu && (() => {
            const isWorking = orchestratorStatus === 'responding';
            const activeColor = isWorking ? '#fbbf24' : moderatorModel.color;
            return (
              <div
                data-card
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] p-4 rounded-xl z-[200] transition-all duration-300"
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${activeColor}40`,
                  boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 30px ${activeColor}20`
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Orchestrator</div>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-xs font-medium text-slate-300">{moderatorModel.name}</span>
                  {isWorking && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      Working
                    </span>
                  )}
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
            );
          })()}

          {/* Auto Mode Context Menu - Rendered via Portal */}
          {showOrchestratorMenu && menuPosition && createPortal(
            <div
              ref={orchestratorMenuRef}
              className="w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden"
              style={{
                position: 'fixed',
                top: `${menuPosition.y}px`,
                left: `${menuPosition.x}px`,
                transform: 'translateY(-50%)',
                zIndex: 9999,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {orchestratorAutoMode ? (
                <>
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-700/50">
                    Auto Mode: {orchestratorAutoScope.toUpperCase()}
                  </div>
                  {(['all', 'local', 'api'] as OrchestratorAutoScope[]).map(scope => (
                    <button
                      key={scope}
                      onClick={() => {
                        setOrchestratorAutoScope(scope);
                        setShowOrchestratorMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${orchestratorAutoScope === scope
                        ? 'bg-yellow-500/20 text-yellow-300'
                        : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                    >
                      {scope === 'all' && 'All'}
                      {scope === 'local' && 'Local'}
                      {scope === 'api' && 'API'}
                      <span className="text-[10px] text-slate-500 ml-1">
                        {scope === 'all' && '(local → API)'}
                        {scope === 'local' && '(no quota)'}
                        {scope === 'api' && '(cloud only)'}
                      </span>
                    </button>
                  ))}
                  <div className="border-t border-slate-700">
                    <button
                      onClick={() => {
                        setOrchestratorAutoMode(false);
                        setShowOrchestratorMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-slate-400 hover:bg-slate-700/50 transition-colors"
                    >
                      Manual Mode
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-700/50">
                    Select Orchestrator
                  </div>
                  {availableModels.filter(m => m.type === 'api').length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-600 font-semibold">
                        API Models
                      </div>
                      {availableModels.filter(m => m.type === 'api').map(model => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setModerator(model.id);
                            setShowOrchestratorMenu(false);
                          }}
                          className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${moderatorId === model.id
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'text-slate-300 hover:bg-slate-700/50'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{model.name}</span>
                            {moderatorId === model.id && (
                              <span className="text-blue-400">✓</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {availableModels.filter(m => m.type === 'local').length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-600 font-semibold border-t border-slate-700/50 mt-1">
                        Local Models
                      </div>
                      {availableModels.filter(m => m.type === 'local').map(model => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setModerator(model.id);
                            setShowOrchestratorMenu(false);
                          }}
                          className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${moderatorId === model.id
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'text-slate-300 hover:bg-slate-700/50'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{model.name}</span>
                            {moderatorId === model.id && (
                              <span className="text-blue-400">✓</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  <div className="border-t border-slate-700">
                    <button
                      onClick={() => {
                        setOrchestratorAutoMode(true);
                        setShowOrchestratorMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-yellow-400 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                    >
                      <Zap size={12} />
                      <span>Enable Auto Mode</span>
                    </button>
                  </div>
                </>
              )}
            </div>,
            document.body
          )}
        </div>
      )}

      {mode !== 'compare' && (
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
      )}
    </>
  );
}

function getGridLayout(index: number, gridCols: number) {
  const row = Math.floor(index / gridCols);
  const col = index % gridCols;
  const totalWidth = (GRID_CARD_WIDTH + LAYOUT.gapX) * gridCols - LAYOUT.gapX;
  const gridY = row * (GRID_CARD_HEIGHT + LAYOUT.gapY);
  const gridX = col * (GRID_CARD_WIDTH + LAYOUT.gapX) - totalWidth / 2 + GRID_CARD_WIDTH / 2;
  return { gridX, gridY };
}

function getCardTransform({
  mode,
  gridX,
  gridY,
  circleX,
  circleY,
  dragState,
  modelId,
}: {
  mode: Mode;
  gridX: number;
  gridY: number;
  circleX: number;
  circleY: number;
  dragState: DragState | null;
  modelId: string;
}) {
  if (dragState?.activeId === modelId) {
    const centerX = dragState.currX + dragState.offsetX;
    const centerY = dragState.currY + dragState.offsetY;
    if (mode === 'compare') {
      const xRelative = centerX - (dragState.containerLeft + dragState.containerWidth / 2);
      const topY = (centerY - dragState.containerTop) - (dragState.cardHeight / 2);
      return `translate(calc(-50% + ${xRelative}px), ${topY}px)`;
    }
    const xRel = centerX - (dragState.containerLeft + dragState.containerWidth / 2);
    const yRel = centerY - (dragState.containerTop + dragState.containerHeight / 2);
    return `translate(calc(-50% + ${xRel}px), calc(-50% + ${yRel}px))`;
  }

  if (mode === 'compare') {
    return `translate(calc(-50% + ${gridX}px), ${gridY}px)`;
  }
  return `translate(calc(-50% + ${circleX}px), calc(-50% + ${circleY}px))`;
}

function handleCardClick({
  e,
  modelId,
  suppressClickRef,
  setSelectedCardIds,
  selectedModels,
  lastSelectedCardRef,
}: {
  e: ReactMouseEvent;
  modelId: string;
  suppressClickRef: MutableRefObject<{ card: boolean; background: boolean }>;
  setSelectedCardIds: Dispatch<SetStateAction<Set<string>>>;
  selectedModels: Model[];
  lastSelectedCardRef: MutableRefObject<string | null>;
}) {
  e.stopPropagation();
  if (suppressClickRef.current.card) {
    suppressClickRef.current.card = false;
    return;
  }

  const isShift = e.shiftKey;
  const isMulti = e.metaKey || e.ctrlKey;

  if (isShift && lastSelectedCardRef.current) {
    // Shift+click: select range from last selected to current
    const lastIndex = selectedModels.findIndex(m => m.id === lastSelectedCardRef.current);
    const currentIndex = selectedModels.findIndex(m => m.id === modelId);

    if (lastIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      const rangeIds = selectedModels.slice(start, end + 1).map(m => m.id);

      setSelectedCardIds(prev => {
        const next = new Set(prev);
        rangeIds.forEach(id => next.add(id));
        return next;
      });
    }
  } else if (isMulti) {
    // Cmd/Ctrl+click: toggle individual item
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
    lastSelectedCardRef.current = modelId;
  } else {
    // Regular click: select only this item
    setSelectedCardIds(new Set([modelId]));
    lastSelectedCardRef.current = modelId;
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
  thinkingFallback: React.ReactNode;
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

function renderPreviewContent({
  model,
  isSpeaking,
  getTailSnippet,
  maxChars = 220,
}: {
  model: Model;
  isSpeaking: boolean;
  getTailSnippet: (text: string, maxChars?: number) => string;
  maxChars?: number;
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
    return getTailSnippet(model.response, maxChars);
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

const GRID_CONTENT_STYLE: React.CSSProperties = {
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
