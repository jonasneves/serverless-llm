import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { Model, Mode, Position, BackgroundStyle } from './types';
import { BG_STYLES, MODE_COLORS, LAYOUT } from './constants';
import ModelDock from './components/ModelDock';
import PromptInput from './components/PromptInput';
import Header from './components/Header';
import ResponseInspector from './components/ResponseInspector';
import SettingsModal from './components/SettingsModal';
import TopicsDrawer from './components/TopicsDrawer';
import { useModelsManager } from './hooks/useModelsManager';
import { usePersistedSetting } from './hooks/usePersistedSetting';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useStreamAccumulator } from './hooks/useStreamAccumulator';
import { useSessionController } from './hooks/useSessionController';
import { useSelectionBox } from './hooks/useSelectionBox';
import { useCardReorder } from './hooks/useCardReorder';
import { useInspectorSelection } from './hooks/useInspectorSelection';
import { ArenaCanvas } from './components/arenas/ArenaCanvas';
import { ArenaContextMenu } from './components/arenas/types';
import DiscussionTranscript from './components/DiscussionTranscript';
import type { ExecutionTimeData } from './components/ExecutionTimeDisplay';
import './playground.css';

const BACKGROUND_IGNORE_SELECTOR = 'button, input, textarea, select, a, [role="button"], [data-no-background], [data-card]';
export default function Playground() {
  const {
    modelsData,
    setModelsData,
    selected,
    setSelected,
    moderator,
    setModerator,
    availableModels,
    totalModelsByType,
    allSelectedByType,
    modelIdToName,
  } = useModelsManager();
  const [mode, setMode] = useState<Mode>('compare');
  const [linesTransitioning, setLinesTransitioning] = useState(false);
  const lineTransitionTimeoutRef = useRef<number | null>(null);

  // Dock Drag & Drop State (HTML5 DnD for Dock -> Arena)
  const [draggedDockModelId, setDraggedDockModelId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [showDock, setShowDock] = useState(false);
  const [gridCols, setGridCols] = useState(2); // State for dynamic grid columns
  // Arena vertical offset is visual-only; keep it in refs to avoid full re-renders on scroll.
  const arenaOffsetYRef = useRef(0);
  const arenaTargetYRef = useRef(0);
  const wheelRafRef = useRef<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [githubToken, setGithubToken] = usePersistedSetting<string>('github_models_token', '', {
    serialize: value => value ? value : null,
    deserialize: (stored, fallback) => stored ?? fallback,
  });

  const [inspectorPosition, setInspectorPosition] = usePersistedSetting<'left' | 'right'>(
    'inspector_position',
    'right',
    {
      serialize: value => value,
      deserialize: (stored, fallback) => (stored === 'left' || stored === 'right') ? (stored as 'left' | 'right') : fallback,
    },
  );

  const [showCouncilReviewerNames, setShowCouncilReviewerNames] = usePersistedSetting<boolean>(
    'show_council_reviewer_names',
    false,
    {
      serialize: value => String(value),
      deserialize: stored => stored === 'true',
    },
  );

  // Execution time tracking: { modelId: { startTime, firstTokenTime, endTime } }
  const [executionTimes, setExecutionTimes] = useState<Record<string, ExecutionTimeData>>({});
  const dockRef = useRef<HTMLDivElement>(null); // Ref for the Model Dock

  const abortControllerRef = useRef<AbortController | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const {
    history,
    historyRef: conversationHistoryRef,
    pushHistoryEntries,
    historyToText,
    buildCarryoverHistory,
  } = useConversationHistory();

  const summarizeSessionResponses = (responses: Record<string, string>, order: string[]) => {
    const seen = new Set<string>();
    const uniqueOrder = order.filter(Boolean).filter((id, idx, arr) => arr.indexOf(id) === idx);
    const entries: Array<{ id: string; text: string }> = [];

    uniqueOrder.forEach(id => {
      const text = responses[id];
      if (text && text.trim()) {
        entries.push({ id, text: text.trim() });
        seen.add(id);
      }
    });

    Object.entries(responses).forEach(([id, text]) => {
      if (seen.has(id) || !text || !text.trim()) return;
      entries.push({ id, text: text.trim() });
    });

    if (!entries.length) return null;
    return entries.map(({ id, text }) => `${modelIdToName(id)}:\n${text}`).join('\n\n');
  };

  // Dynamic grid column calculation
  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === visualizationAreaRef.current) {
          const availableWidth = entry.contentRect.width;
          let newCols = Math.floor(availableWidth / (LAYOUT.cardWidth + LAYOUT.gapX));
          newCols = Math.max(1, newCols); // Ensure at least 1 column
          setGridCols(newCols);
        }
      }
    });

    if (visualizationAreaRef.current) {
      resizeObserver.observe(visualizationAreaRef.current);
    }

    return () => {
      if (visualizationAreaRef.current) {
        resizeObserver.unobserve(visualizationAreaRef.current);
      }
    };
  }, []);

  // Local state for GitHub Models token is persisted via usePersistedSetting

  // Map selected IDs to models to preserve user-defined order (important for drag-and-drop)
  const selectedModels = selected
    .map(id => modelsData.find(m => m.id === id))
    .filter((m): m is Model => !!m && (mode === 'compare' || m.id !== moderator));

  // Dynamic layout radius calculation (Moved up for scope access in drag handlers)
  const layoutRadius = mode === 'compare' ? 0 : Math.max(LAYOUT.baseRadius, LAYOUT.minRadius + selectedModels.length * LAYOUT.radiusPerModel);

  const getCirclePosition = (index: number, total: number, currentMode: Mode, radius: number): Position => {
    if (currentMode === 'council') {
      const startAngle = 250;
      const endAngle = 470;
      const angleRange = endAngle - startAngle;
      const angle = (startAngle + (index * angleRange / (total - 1))) - 90;
      const rad = angle * Math.PI / 180;
      return {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        angle
      };
    }

    const angle = (index * 360 / total) - 90;
    const x = Math.cos(angle * Math.PI / 180) * radius;
    const y = Math.sin(angle * Math.PI / 180) * radius;
    return { x, y, angle };
  };

  /* HTML5 Drag & Drop Handlers (Dock -> Arena) */
  const handleDockDragStart = (e: React.DragEvent, modelId: string) => {
    setDraggedDockModelId(modelId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (draggedDockModelId) {
      if (!selected.includes(draggedDockModelId)) {
        setSelected(prev => [...prev, draggedDockModelId]);
      }
      setDraggedDockModelId(null);
    }
  };

  const handleModelToggle = (modelId: string) => {
    if (selected.includes(modelId)) {
      // Removing a model
      const isRemovingActive = isGenerating && sessionModelIdsRef.current.includes(modelId);

      if (isRemovingActive && lastQuery) {
        // We are removing a model while generating. Restart session without it.
        if (abortControllerRef.current) abortControllerRef.current.abort();

        const remainingIds = sessionModelIdsRef.current.filter(id => id !== modelId);

        // Collect existing responses to avoid re-generation
        const previousResponses: Record<string, string> = {};
        modelsData.forEach(m => {
          if (remainingIds.includes(m.id) && m.response && !m.error) {
            previousResponses[m.id] = m.response;
          }
        });

        // Update selection state immediately
        setSelected(prev => prev.filter(id => id !== modelId));
        if (selectedCardIds.has(modelId)) {
          setSelectedCardIds(prev => {
            const next = new Set(prev);
            next.delete(modelId);
            return next;
          });
        }

        // Restart if we have enough participants (Council needs 2+)
        if (mode === 'council' && remainingIds.length < 2) {
          setIsGenerating(false);
          setIsSynthesizing(false);
          setModeratorSynthesis('Council requires at least 2 participants.');
          setPhaseLabel('Error');
          return;
        }

        // Trigger restart with override
        sendMessage(lastQuery, previousResponses, remainingIds, { skipHistory: true });

      } else {
        // Normal removal
        setSelected(prev => prev.filter(id => id !== modelId));
      }

    } else {
      // Adding a model
      setSelected(prev => [...prev, modelId]);
    }
  };

  const handleAddGroup = (type: 'local' | 'api') => {
    const idsOfType = modelsData.filter(m => m.type === type).map(m => m.id);
    const isAllSelected = idsOfType.length > 0 && idsOfType.every(id => selected.includes(id));

    if (isAllSelected) {
      setSelected(prev => prev.filter(id => !idsOfType.includes(id)));
      return;
    }

    const modelsToAdd = availableModels
      .filter(m => m.type === type)
      .map(m => m.id);
    if (modelsToAdd.length > 0) {
      setSelected(prev => [...prev, ...modelsToAdd]);
    }
  };
  const [hoveredCard, setHoveredCard] = useState<string | null>(null); // For tiny preview on hover
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const {
    selectedCardIds,
    setSelectedCardIds,
    activeInspectorId,
    setActiveInspectorId,
    clearInspectorSelection,
  } = useInspectorSelection();
  const inputRef = useRef<HTMLInputElement>(null);
  const visualizationAreaRef = useRef<HTMLDivElement>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastSelectedCardRef = useRef<string | null>(null);
  const suppressClickRef = useRef({ card: false, background: false });
  const thinkingStateRef = useRef<Record<string, { inThink: boolean; carry: string }>>({});
  const sessionModelIdsRef = useRef<string[]>([]);
  const {
    enqueueStreamDelta,
    clearPendingStreamForModel,
    resetPendingStream,
  } = useStreamAccumulator(setModelsData);

  const {
    selectionRect,
    isSelecting,
    dragSelectionActiveRef,
  } = useSelectionBox({
    rootContainerRef,
    visualizationAreaRef,
    arenaOffsetYRef,
    arenaTargetYRef,
    wheelRafRef,
    selectedModels,
    cardRefs,
    selectedCardIds,
    setSelectedCardIds,
    setActiveInspectorId,
    suppressClickRef,
  });

  const handleSelectPrompt = (prompt: string) => {
    if (inputRef.current) {
      inputRef.current.value = prompt;
      inputRef.current.focus();
      setInputFocused(true);
    }
    setShowTopics(false);
  };

  const { dragState, handlePointerDown } = useCardReorder({
    visualizationAreaRef,
    cardRefs,
    selected,
    setSelected,
    mode,
    gridCols,
    getCirclePosition,
  });

  useEffect(() => () => resetPendingStream(), [resetPendingStream]);

  const [contextMenu, setContextMenu] = useState<ArenaContextMenu>(null);

  useEffect(() => {
    const className = 'arena-selecting';
    const body = document.body;
    if (isSelecting) {
      body.classList.add(className);
    } else {
      body.classList.remove(className);
    }
    return () => {
      body.classList.remove(className);
    };
  }, [isSelecting]);

  const isBackgroundTarget = useCallback(
    (target: HTMLElement | null) => {
      if (!target) return false;
      return !target.closest(BACKGROUND_IGNORE_SELECTOR);
    },
    [],
  );

  const handleBackgroundClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isBackgroundTarget(event.target as HTMLElement | null)) return;
      if (suppressClickRef.current.background) {
        suppressClickRef.current.background = false;
        return;
      }
      setHoveredCard(null);
      clearInspectorSelection();
      suppressClickRef.current.background = false;
    },
    [isBackgroundTarget, clearInspectorSelection],
  );

  const handleBackgroundContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isBackgroundTarget(event.target as HTMLElement | null)) return;
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'background' });
    },
    [isBackgroundTarget],
  );

  const triggerLineTransition = useCallback(() => {
    setLinesTransitioning(true);
    if (lineTransitionTimeoutRef.current) {
      clearTimeout(lineTransitionTimeoutRef.current);
    }
    lineTransitionTimeoutRef.current = window.setTimeout(() => {
      setLinesTransitioning(false);
      lineTransitionTimeoutRef.current = null;
    }, 350);
  }, []);

  const handleModeChange = useCallback((nextMode: Mode) => {
    if (nextMode === mode) return;
    triggerLineTransition();
    setMode(nextMode);
  }, [mode, triggerLineTransition]);

  useEffect(() => () => {
    if (lineTransitionTimeoutRef.current) {
      clearTimeout(lineTransitionTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [moderatorSynthesis, setModeratorSynthesis] = useState<string>('');

  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [councilAggregateRankings, setCouncilAggregateRankings] = useState<Array<{
    model_id: string;
    model_name: string;
    average_rank: number;
    votes_count: number;
  }> | null>(null);
  const [councilAnonymousReviews, setCouncilAnonymousReviews] = useState<Array<{
    reviewer_model_id: string;
    reviewer_model_name: string;
    text: string;
    error?: boolean;
  }>>([]);
  const [discussionTurnsByModel, setDiscussionTurnsByModel] = useState<Record<string, Array<{
    turn_number: number;
    response: string;
    evaluation?: any;
  }>>>({});
  const [failedModels, setFailedModels] = useState<Set<string>>(new Set());
  const failedModelsRef = useRef<Set<string>>(new Set());
  const currentDiscussionTurnRef = useRef<{ modelId: string; turnNumber: number } | null>(null);

  const compareCardRectsRef = useRef<Record<string, DOMRect>>({});
  const prevModeRef = useRef<Mode>(mode);
  const [orchestratorEntryOffset, setOrchestratorEntryOffset] = useState<{ x: number; y: number } | null>(null);
  const resetFailedModels = () => {
    const empty = new Set<string>();
    failedModelsRef.current = empty;
    setFailedModels(empty);
  };
  const markModelFailed = (modelId: string) => {
    setFailedModels(prev => {
      if (prev.has(modelId)) return prev;
      const next = new Set(prev);
      next.add(modelId);
      failedModelsRef.current = next;
      return next;
    });
  };

  const { sendMessage } = useSessionController({
    mode,
    moderator,
    selected,
    selectedCardIds,
    githubToken,
    isGenerating,
    summarizeSessionResponses,
    setLastQuery,
    setHoveredCard,
    setPhaseLabel,
    setModeratorSynthesis,
    setCouncilAggregateRankings,
    setCouncilAnonymousReviews,
    setDiscussionTurnsByModel,
    resetFailedModels,
    markModelFailed,
    failedModelsRef,
    currentDiscussionTurnRef,
    sessionModelIdsRef,
    abortControllerRef,
    thinkingStateRef,
    conversationHistoryRef,
    pushHistoryEntries,
    historyToText,
    buildCarryoverHistory,
    setModelsData,
    modelIdToName,
    setExecutionTimes,
    setIsGenerating,
    setIsSynthesizing,
    setSpeaking,
    enqueueStreamDelta,
    clearPendingStreamForModel,
    resetPendingStream,
  });

  // Council/Roundtable synthesis is handled by backend streams.

  // Handle Escape key to close dock and Delete/Backspace to remove selected models
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape: unfocus active element, close dock, clear hover
      if (event.key === 'Escape') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && activeEl !== document.body) {
          activeEl.blur();
        }
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (showTopics) {
          setShowTopics(false);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (activeInspectorId || selectedCardIds.size > 0) {
          clearInspectorSelection();
          setHoveredCard(null);
          return;
        }
        if (showDock) {
          setShowDock(false);
          return;
        }
        setHoveredCard(null);
        return;
      }

      // Don't trigger keyboard shortcuts if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const order: Mode[] = ['compare', 'council', 'roundtable'];
        const currentIndex = order.indexOf(mode);
        if (currentIndex !== -1) {
          const delta = event.key === 'ArrowRight' ? 1 : -1;
          const nextIndex = (currentIndex + delta + order.length) % order.length;
          handleModeChange(order[nextIndex]);
        }
        return;
      }

      // 'M' toggles models dock
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        setShowDock(!showDock);
        return;
      }

      // Delete or Backspace removes selected cards from arena
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedCardIds.size > 0) {
        event.preventDefault();
        setSelected(prev => prev.filter(id => !selectedCardIds.has(id)));
        clearInspectorSelection();
        return;
      }

      // Enter opens inspector for selected card
      if (event.key === 'Enter' && selectedCardIds.size === 1) {
        event.preventDefault();
        const selectedId = Array.from(selectedCardIds)[0];
        setActiveInspectorId(selectedId);
        return;
      }

      // Auto-focus input when typing printable characters (except shortcut keys)
      // Check if it's a printable character (single character, not a modifier key)
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (inputRef.current) {
          inputRef.current.focus();
          // The character will be typed into the input automatically
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    showDock,
    showSettings,
    showTopics,
    contextMenu,
    activeInspectorId,
    selectedCardIds,
    mode,
    handleModeChange,
    clearInspectorSelection,
  ]);

  // Handle wheel scroll to move arena up/down
  useEffect(() => {
    const applyOffset = (offset: number) => {
      const el = visualizationAreaRef.current;
      if (!el) return;
      el.style.setProperty('--arena-offset-y', `${offset}px`);
    };

    const clampTarget = (value: number) =>
      Math.max(-LAYOUT.scrollClamp, Math.min(LAYOUT.scrollClamp, value));

    const step = () => {
      const current = arenaOffsetYRef.current;
      const target = arenaTargetYRef.current;
      const diff = target - current;

      if (Math.abs(diff) < 0.5) {
        arenaOffsetYRef.current = target;
        applyOffset(target);
        wheelRafRef.current = null;
        return;
      }

      // Ease toward target for a more natural feel.
      const next = current + diff * 0.35;
      arenaOffsetYRef.current = next;
      applyOffset(next);
      wheelRafRef.current = requestAnimationFrame(step);
    };

    const ensureRaf = () => {
      if (wheelRafRef.current == null) {
        wheelRafRef.current = requestAnimationFrame(step);
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (dragSelectionActiveRef.current) return;
      const target = event.target as HTMLElement | null;
      // Let native scroll work inside text inputs
      if (target && target.closest('input, textarea, [data-no-arena-scroll]')) return;

      event.preventDefault();
      const delta = event.deltaY * 0.9; // Slightly faster / closer to native feel
      const nextTarget = arenaTargetYRef.current - delta;
      arenaTargetYRef.current = clampTarget(nextTarget);
      ensureRaf();
    };

    // Touch / mobile panning (single-finger vertical)
    let touchActive = false;
    let lastTouchY = 0;

    const shouldIgnoreTouch = (target: HTMLElement | null) => {
      if (!target) return false;
      return Boolean(
        target.closest('input, textarea, [data-no-arena-scroll], [data-card], button, a, select, [role="button"]')
      );
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (shouldIgnoreTouch(target)) return;
      touchActive = true;
      lastTouchY = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (dragSelectionActiveRef.current) return;
      if (!touchActive || event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (shouldIgnoreTouch(target)) {
        touchActive = false;
        return;
      }

      const touchY = event.touches[0].clientY;
      const deltaY = touchY - lastTouchY;
      lastTouchY = touchY;

      event.preventDefault();
      arenaTargetYRef.current = clampTarget(arenaTargetYRef.current + deltaY);
      ensureRaf();
    };

    const handleTouchEnd = () => {
      touchActive = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      window.removeEventListener('wheel', handleWheel);
      if (wheelRafRef.current != null) {
        cancelAnimationFrame(wheelRafRef.current);
      }
    };
  }, []);

  const [bgStyle, setBgStyle] = usePersistedSetting<BackgroundStyle>(
    'playground-bg-style',
    'dots-mesh',
    {
      serialize: value => value,
      deserialize: (stored, fallback) =>
        stored && BG_STYLES.includes(stored as BackgroundStyle)
          ? (stored as BackgroundStyle)
          : fallback,
    },
  );

  const cycleBgStyle = (direction: 'prev' | 'next') => {
    const currentIndex = BG_STYLES.indexOf(bgStyle);
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % BG_STYLES.length
      : (currentIndex - 1 + BG_STYLES.length) % BG_STYLES.length;
    setBgStyle(BG_STYLES[newIndex]);
  };

  const moderatorModel = modelsData.find(m => m.id === moderator);
  const inspectorModels = modelsData.filter(m => selectedCardIds.has(m.id));

  const orchestratorStatus = isSynthesizing
    ? 'responding'
    : isGenerating
      ? 'waiting'
      : moderatorSynthesis
        ? 'done'
        : 'idle';

  const orchestratorPhaseLabel = phaseLabel
    ? phaseLabel
    : isSynthesizing
      ? 'Synthesizing'
      : isGenerating
        ? 'Observing'
        : moderatorSynthesis
          ? 'Done'
          : 'Presiding';

  const orchestratorTransform = orchestratorEntryOffset
    ? `translate(-50%, -50%) translate(${orchestratorEntryOffset.x}px, ${orchestratorEntryOffset.y}px)`
    : 'translate(-50%, -50%)';
  const orchestratorTransformWithScale = `${orchestratorTransform} scale(1)`;

  useLayoutEffect(() => {
    if (mode !== 'compare') return;
    const rects: Record<string, DOMRect> = {};
    selectedModels.forEach(model => {
      const card = cardRefs.current.get(model.id);
      if (card) {
        rects[model.id] = card.getBoundingClientRect();
      }
    });
    compareCardRectsRef.current = rects;
  }, [mode, selectedModels.length, selectedModels.map(m => m.id).join(',')]);

  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode === 'compare' && mode !== 'compare' && moderator && visualizationAreaRef.current) {
      const rect = compareCardRectsRef.current[moderator];
      const viz = visualizationAreaRef.current.getBoundingClientRect();
      if (rect && viz.width > 0 && viz.height > 0) {
        const targetX = viz.left + viz.width / 2;
        const verticalOffset = mode === 'council' ? layoutRadius - 64 : 0;
        const targetY = viz.top + (viz.height * 0.5 + verticalOffset);
        const offsetX = rect.left + rect.width / 2 - targetX;
        const offsetY = rect.top + rect.height / 2 - targetY;
        if (Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) {
          setOrchestratorEntryOffset({ x: offsetX, y: offsetY });
          requestAnimationFrame(() => setOrchestratorEntryOffset(null));
        }
      }
    }
    prevModeRef.current = mode;
  }, [mode, moderator, layoutRadius]);

  const bgClass = bgStyle === 'none' ? '' : `bg-${bgStyle}`;

  const getTailSnippet = (text: string, maxChars: number = 280) => {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return `…${text.slice(text.length - maxChars)}`;
  };

  return (
    <div
      ref={rootContainerRef}
      className={`fixed inset-0 overflow-hidden text-white ${bgClass}`}
      style={{
        backgroundColor: MODE_COLORS[mode],
        transition: 'background-color 1s ease',
        ...(bgStyle === 'none' ? { background: MODE_COLORS[mode] } : {}),
        ...(isSelecting ? { userSelect: 'none', WebkitUserSelect: 'none' } : {}),
      }}
      onClick={handleBackgroundClick}
      onContextMenu={handleBackgroundContextMenu}
    >
      {/* Header */}
      <Header
        mode={mode}
        setMode={handleModeChange}
        setHoveredCard={setHoveredCard}
        clearSelection={clearInspectorSelection}
        cycleBgStyle={cycleBgStyle}
        showDock={showDock}
        setShowDock={setShowDock}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Content Wrapper with Sidebar Offset */}
      <div
        style={{
          paddingLeft: activeInspectorId && mode === 'compare' && inspectorPosition === 'left' ? '28rem' : '1.5rem',
          paddingRight: activeInspectorId && mode === 'compare' && inspectorPosition === 'right' ? '28rem' : '1.5rem',
        }}
      >
        {/* Dock Backdrop */}
        {showDock && (
          <div
            className="fixed inset-0 z-[55] bg-black/10 backdrop-blur-[1px] transition-opacity duration-300"
            onClick={() => setShowDock(false)}
          />
        )}

        {/* Model Dock (Left) */}
        <ModelDock
          showDock={showDock}
          availableModels={availableModels}
          allSelectedByType={allSelectedByType}
          totalModelsByType={totalModelsByType}
          handleDragStart={handleDockDragStart}
          handleModelToggle={handleModelToggle}
          handleAddGroup={handleAddGroup}
          dockRef={dockRef}
        />

        {/* Main Content Area */}
        <div className="flex h-screen w-full relative">
          {/* Left/Main Visualization Area */}
          <div
            className={`relative flex-1 transition-all duration-300 flex flex-col pt-24`}
          >
            <div
              ref={visualizationAreaRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative w-full h-full z-0 transition-all duration-300`}
              style={{
                // Base styles for all modes
                position: 'relative',
                display: 'flex',
                // Compare mode aligns top for scrolling, others center
                alignItems: mode === 'compare' ? 'flex-start' : 'center',
                justifyContent: 'center',
                ['--arena-offset-y' as any]: `${arenaOffsetYRef.current}px`,
                transform: `translateY(var(--arena-offset-y)) scale(${isDraggingOver ? 1.02 : 1})`,
                willChange: 'transform',
                border: isDraggingOver ? '2px dashed rgba(59, 130, 246, 0.4)' : '2px dashed transparent',
                borderRadius: isDraggingOver ? '24px' : '0px',
                transition: 'transform 0s linear',

                // Mode-specific styles override base
                ...(mode === 'compare' ? {
                  minHeight: '300px', // Minimum height to ensure clickable background
                  paddingBottom: '120px', // Extra space at bottom for right-click menu access
                } : {
                  height: '100%',
                  minHeight: '100%',
                  overflow: 'hidden' // Prevent scroll in arena for council
                }),

                ...(isDraggingOver ? {
                  background: 'rgba(59, 130, 246, 0.05)',
                } : {})
              }}
            >
              <ArenaCanvas
                mode={mode}
                selectedModels={selectedModels}
                gridCols={gridCols}
                speaking={speaking}
                selectedCardIds={selectedCardIds}
                setSelectedCardIds={setSelectedCardIds}
                setActiveInspectorId={setActiveInspectorId}
                executionTimes={executionTimes}
                failedModels={failedModels}
                cardRefs={cardRefs}
                handlePointerDown={handlePointerDown}
                dragState={dragState}
                handleModelToggle={handleModelToggle}
                setContextMenu={setContextMenu}
                suppressClickRef={suppressClickRef}
                getTailSnippet={getTailSnippet}
                hoveredCard={hoveredCard}
                setHoveredCard={setHoveredCard}
                layoutRadius={layoutRadius}
                getCirclePosition={getCirclePosition}
                moderatorModel={moderatorModel}
                moderatorId={moderator}
                orchestratorTransform={orchestratorTransformWithScale}
                orchestratorStatus={orchestratorStatus}
                orchestratorPhaseLabel={orchestratorPhaseLabel}
                moderatorSynthesis={moderatorSynthesis}
                isSynthesizing={isSynthesizing}
                isGenerating={isGenerating}
                phaseLabel={phaseLabel}
                linesTransitioning={linesTransitioning}
                lastSelectedCardRef={lastSelectedCardRef}
              />
            </div>
          </div>

          {/* Right Panel: Transcript (Only for Council/Roundtable) */}
          {mode !== 'compare' && (
            <div className="w-[400px] xl:w-[480px] flex flex-col border-l border-white/5 bg-slate-900/20 backdrop-blur-sm z-40 relative h-full">
              <DiscussionTranscript
                history={history}
                models={modelsData}
                className="pt-24 mask-fade-top"
              />

              <div className="p-4 border-t border-white/5 relative z-[50]">
                <PromptInput
                  inputRef={inputRef}
                  inputFocused={inputFocused}
                  setInputFocused={setInputFocused}
                  onSendMessage={sendMessage}
                  onOpenTopics={() => setShowTopics(true)}
                  className="relative w-full"
                  style={{ paddingBottom: '0' }}
                  placeholder="Steer the discussion..."
                />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Selection rectangle overlay - positioned relative to root container */}
      {selectionRect && (
        <div
          className="absolute pointer-events-none border-2 border-blue-400 bg-blue-400/10 z-50"
          style={{
            left: `${selectionRect.left}px`,
            top: `${selectionRect.top}px`,
            width: `${selectionRect.width}px`,
            height: `${selectionRect.height}px`,
          }}
        />
      )}

      {activeInspectorId && inspectorModels.length > 0 && (
        <ResponseInspector
          models={inspectorModels}
          activeId={activeInspectorId}
          onSelect={setActiveInspectorId}
          onClose={clearInspectorSelection}
          speaking={speaking}
          mode={mode}
          moderatorId={moderator}
          councilAggregateRankings={councilAggregateRankings}
          councilAnonymousReviews={councilAnonymousReviews}
          showCouncilReviewerNames={showCouncilReviewerNames}
          discussionTurnsByModel={discussionTurnsByModel}
          position={inspectorPosition}
          onTogglePosition={() => setInspectorPosition(prev => prev === 'left' ? 'right' : 'left')}
        />
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        token={githubToken}
        setToken={setGithubToken}
        showCouncilReviewerNames={showCouncilReviewerNames}
        setShowCouncilReviewerNames={setShowCouncilReviewerNames}
      />

      <TopicsDrawer
        open={showTopics}
        onClose={() => setShowTopics(false)}
        onSelectPrompt={handleSelectPrompt}
      />

      {/* Fixed Prompt Input for Compare Mode ONLY */}
      {mode === 'compare' && (
        <PromptInput
          inputRef={inputRef}
          inputFocused={inputFocused}
          setInputFocused={setInputFocused}
          onSendMessage={sendMessage}
          onOpenTopics={() => setShowTopics(true)}
        />
      )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-[200] min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'background' ? (
            // Background context menu - Add Model option
            <button
              className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2"
              onClick={() => {
                setShowDock(true);
                setContextMenu(null);
              }}
            >
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Model
            </button>
          ) : contextMenu.modelId ? (
            // Model context menu - different options based on mode
            <>
              {/* Open Inspector option */}
              <button
                className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2"
                onClick={() => {
                  setActiveInspectorId(contextMenu.modelId!);
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open
              </button>

              {/* Set as Orchestrator - only in Council/Roundtable modes and not already the orchestrator */}
              {mode !== 'compare' && contextMenu.modelId !== moderator && (
                <button
                  className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2"
                  onClick={() => {
                    setModerator(contextMenu.modelId!);
                    setContextMenu(null);
                  }}
                >
                  <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Set as Orchestrator
                </button>
              )}

              {/* Remove Model option - available in all modes */}
              <button
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 transition-colors flex items-center gap-2"
                onClick={() => {
                  const removingModerator = contextMenu.modelId === moderator;

                  // Remove the model from selected
                  handleModelToggle(contextMenu.modelId!);

                  // If removing the orchestrator, auto-select a new one from remaining models
                  if (removingModerator && mode !== 'compare') {
                    const remaining = selected.filter(id => id !== contextMenu.modelId);
                    if (remaining.length > 0) {
                      setModerator(remaining[0]);
                    } else {
                      // If no models remain, clear moderator
                      setModerator('');
                    }
                  }
                  setContextMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove
              </button>
            </>
          ) : null}
        </div>
      )}

    </div>
  );
}
