import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Model, Mode, Position, BackgroundStyle } from './types';
import { BG_STYLES, MODE_COLORS, LAYOUT } from './constants';
import ModelDock from './components/ModelDock';
import PromptInput from './components/PromptInput';
import Header from './components/Header';
import { useModelsManager } from './hooks/useModelsManager';
import { usePersistedSetting } from './hooks/usePersistedSetting';
import { useExtensionConfig } from './hooks/useExtensionConfig';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useStreamAccumulator } from './hooks/useStreamAccumulator';
import { useSessionController } from './hooks/useSessionController';
import { useSelectionBox } from './hooks/useSelectionBox';
import { useCardReorder } from './hooks/useCardReorder';
import { useModelSelection } from './hooks/useModelSelection';
import { ArenaCanvas } from './components/arenas/ArenaCanvas';
import { ArenaContextMenu } from './components/arenas/types';
import type { ExecutionTimeData } from './components/ExecutionTimeDisplay';
import SelectionOverlay from './components/SelectionOverlay';
import { GestureProvider, useGesture } from './context/GestureContext';
import './playground.css';

const SettingsModal = lazy(() => import('./components/SettingsModal'));
const DiscussionTranscript = lazy(() => import('./components/DiscussionTranscript'));
const GestureControl = lazy(() => import('./components/GestureControl'));
const HandBackground = lazy(() => import('./components/HandBackground'));
const ChatView = lazy(() => import('./components/ChatView').then(m => ({ default: m.default })));
import ErrorBoundary from './components/ErrorBoundary';

import type { ChatViewHandle, ChatMessage } from './components/ChatView';

const BACKGROUND_IGNORE_SELECTOR = 'button, input, textarea, select, a, [role="button"], [data-no-background], [data-card]';

// Inner component that uses GestureContext
function PlaygroundInner() {
  // Access gesture context for HandBackground rendering
  const gestureCtx = useGesture();

  // Load extension configuration (endpoints, github token) from chrome.storage
  // This configures the apiClient with user's saved settings on startup
  const { config: _extensionConfig, isLoaded: _extensionConfigLoaded } = useExtensionConfig();

  const {
    modelsData,
    setModelsData,
    selected,
    setSelected,
    chatModelId,
    setChatModelId,
    moderator,
    setModerator,
    availableModels,
    totalModelsByType,
    allSelectedByType,
    modelIdToName,
    isLoading: isLoadingModels,
    loadError: modelsLoadError,
    retryCount: modelsRetryCount,
    retryNow: retryModelsNow,
  } = useModelsManager();
  // Mode persists across page refreshes
  const [mode, setMode] = usePersistedSetting<Mode>(
    'playground_mode',
    'chat',
    {
      serialize: value => value,
      deserialize: (stored, fallback) => {
        const validModes: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
        return validModes.includes(stored as Mode) ? (stored as Mode) : fallback;
      },
    },
  );
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
  const [githubToken, setGithubToken] = usePersistedSetting<string>('github_models_token', '', {
    serialize: value => value ? value : null,
    deserialize: (stored, fallback) => stored ?? fallback,
  });

  const [openrouterKey, setOpenrouterKey] = usePersistedSetting<string>('openrouter_api_key', '', {
    serialize: value => value ? value : null,
    deserialize: (stored, fallback) => stored ?? fallback,
  });


  // Execution time tracking: { modelId: { startTime, firstTokenTime, endTime } }
  const [executionTimes, setExecutionTimes] = useState<Record<string, ExecutionTimeData>>({});
  const dockRef = useRef<HTMLDivElement>(null); // Ref for the Model Dock

  const abortControllerRef = useRef<AbortController | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  // Toast notification for API limit
  const [apiLimitToast, setApiLimitToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showApiLimitToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setApiLimitToast(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setApiLimitToast(null);
      toastTimeoutRef.current = null;
    }, 5000);
  }, []);

  // Check if user can add an API model (requires GitHub token for multi-model modes)
  const canAddApiModel = useCallback((modelId: string): boolean => {
    // Chat mode doesn't have this restriction
    if (mode === 'chat') return true;
    // If they have a token, allow it
    if (githubToken) return true;
    // Check if the model is a github/external model
    const model = modelsData.find(m => m.id === modelId);
    if (!model || (model.type !== 'github' && model.type !== 'external')) return true;
    // No token + github/external model = blocked
    return false;
  }, [mode, githubToken, modelsData]);

  const canAddApiGroup = useCallback((): boolean => {
    // Chat mode doesn't have this restriction
    if (mode === 'chat') return true;
    // If they have a token, allow it
    if (githubToken) return true;
    // No token = blocked for API group
    return false;
  }, [mode, githubToken]);

  // Chat mode state - persisted across mode switches
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // Use useModelSelection hook for better state management
  const {
    autoMode: chatAutoMode,
    autoModeScope: chatAutoModeScope,
    setAutoMode: setChatAutoMode,
    setAutoModeScope: setChatAutoModeScope,
  } = useModelSelection({
    autoMode: true,
    autoModeScope: 'self-hosted',
  });
  const [chatCurrentResponse, setChatCurrentResponse] = useState('');
  const [chatIsGenerating, setChatIsGenerating] = useState(false);
  const prevGestureActiveRef = useRef(false);
  const {
    history,
    historyRef: conversationHistoryRef,
    pushHistoryEntries,
    clearHistory,
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

  useEffect(() => {
    const wasActive = prevGestureActiveRef.current;
    prevGestureActiveRef.current = gestureCtx.isActive;

    if (mode !== 'chat') return;
    if (gestureCtx.isActive && !wasActive) {
      setChatAutoModeScope('api');
    }
  }, [gestureCtx.isActive, mode, setChatAutoModeScope]);



  // Local state for GitHub Models token is persisted via usePersistedSetting

  // Map selected IDs to models to preserve user-defined order (important for drag-and-drop)
  const selectedModels = selected
    .map(id => modelsData.find(m => m.id === id))
    .filter((m): m is Model => !!m && (mode === 'compare' || m.id !== moderator));



  const getCirclePosition = (index: number, total: number, currentMode: Mode, radius: number): Position => {
    if (currentMode === 'analyze') {
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
      if (mode === 'chat') {
        // Chat mode uses separate selection state
        setChatModelId(draggedDockModelId);
      } else if (!selected.includes(draggedDockModelId)) {
        // Check API model limit for multi-model modes
        if (!canAddApiModel(draggedDockModelId)) {
          showApiLimitToast('Add your GitHub token in Settings for API model access with dedicated quota');
          setDraggedDockModelId(null);
          return;
        }
        setSelected(prev => [...prev, draggedDockModelId]);
      }
      setDraggedDockModelId(null);
    }
  };

  const handleModelToggle = (modelId: string) => {
    if (mode === 'chat') {
      // Chat mode uses separate selection state
      setChatModelId(chatModelId === modelId ? null : modelId);
      return;
    }

    if (selected.includes(modelId)) {
      // Removing is always allowed
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

        // Restart if we have enough participants (multi-model modes need 2+)
        if ((mode === 'analyze' || mode === 'debate') && remainingIds.length < 2) {
          setIsGenerating(false);
          setIsSynthesizing(false);
          setModeratorSynthesis('This mode requires at least 2 participants.');
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
      // Adding a model - check API limit for multi-model modes
      if (!canAddApiModel(modelId)) {
        showApiLimitToast('Add your GitHub token in Settings for API model access with dedicated quota');
        return;
      }
      setSelected(prev => [...prev, modelId]);
    }
  };

  const handleAddGroup = (type: 'self-hosted' | 'github' | 'external') => {
    const idsOfType = modelsData.filter(m => m.type === type).map(m => m.id);
    const isAllSelected = idsOfType.length > 0 && idsOfType.every(id => selected.includes(id));

    if (isAllSelected) {
      // Removing is always allowed
      setSelected(prev => prev.filter(id => !idsOfType.includes(id)));
      return;
    }

    // Check API limit for multi-model modes when adding github/external group
    if ((type === 'github' || type === 'external') && !canAddApiGroup()) {
      showApiLimitToast('Add your GitHub token in Settings for API model access with dedicated quota');
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
  // Card selection state (for arena modes)
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const clearSelection = () => setSelectedCardIds(new Set());

  const [arenaSize, setArenaSize] = useState<{ width: number; height: number } | null>(null);

  // Dynamic layout radius calculation
  // Expand to fill available space but enforce minimums to prevent overlap
  const layoutRadius = useMemo(() => {
    if (mode === 'compare') return 0;

    // Minimum radius required to fit all cards without overlapping
    const minRequiredRadius = Math.max(LAYOUT.baseRadius, LAYOUT.minRadius + selectedModels.length * LAYOUT.radiusPerModel);

    if (!arenaSize) return minRequiredRadius;

    // Calculate maximum radius that fits in the viewport
    // Use smaller dimension, subtract padding for card size (buffer ~140px)
    const minDimension = Math.min(arenaSize.width, arenaSize.height);
    const safeMaxRadius = (minDimension / 2) - 140;

    // Use safeMaxRadius to expand, but ensure we never shrink below minRequiredRadius
    return Math.max(minRequiredRadius, safeMaxRadius);
  }, [mode, selectedModels.length, arenaSize]);

  // Dynamic grid column calculation - placed here after activeInspectorId is declared
  useEffect(() => {
    const calculateLayout = () => {
      if (!visualizationAreaRef.current) return;
      const { clientWidth, clientHeight } = visualizationAreaRef.current;

      // Update Grid Cols
      let newCols = Math.floor(clientWidth / (LAYOUT.cardWidth + LAYOUT.gapX));
      newCols = Math.max(1, newCols); // Ensure at least 1 column
      setGridCols(newCols);

      // Update Arena Size
      setArenaSize({ width: clientWidth, height: clientHeight });
    };

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === visualizationAreaRef.current) {
          calculateLayout();
        }
      }
    });

    if (visualizationAreaRef.current) {
      resizeObserver.observe(visualizationAreaRef.current);
      // Trigger initial calculation
      calculateLayout();
    }

    return () => {
      if (visualizationAreaRef.current) {
        resizeObserver.unobserve(visualizationAreaRef.current);
      }
    };
  }, [mode]); // Recalculate when layout changes
  const inputRef = useRef<HTMLInputElement>(null);
  const visualizationAreaRef = useRef<HTMLDivElement>(null);

  const chatViewRef = useRef<ChatViewHandle>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastSelectedCardRef = useRef<string | null>(null);
  const suppressClickRef = useRef({ card: false, background: false });
  const thinkingStateRef = useRef<Record<string, { inThink: boolean; carry: string; implicitThinking?: boolean; harmonyFormat?: boolean }>>({});
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
    suppressClickRef,
  });

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
      clearSelection();
      suppressClickRef.current.background = false;
    },
    [isBackgroundTarget, clearSelection],
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
    // Chat mode uses separate selection (chatModelId) - no cross-mode selection sync needed
    // Reset generating state to prevent blocking new messages in the new mode
    // The background generation will complete but won't block the UI
    setIsGenerating(false);
    setMode(nextMode);
  }, [mode, triggerLineTransition]);

  // Cleanup toast timeout on unmount
  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
  }, []);

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

  // Reset session state for a new round (Analyze, Debate)
  const handleNewSession = useCallback(() => {
    // Clear conversation history
    clearHistory();
    // Reset generation state
    setIsGenerating(false);
    setIsSynthesizing(false);
    setModeratorSynthesis('');
    setPhaseLabel(null);
    // Reset discussion state
    setDiscussionTurnsByModel({});
    // Reset model responses
    setModelsData(prev => prev.map(model => ({
      ...model,
      response: 'Ready to generate...',
      thinking: undefined,
      error: undefined,
    })));
    // Clear execution times
    setExecutionTimes({});
    // Clear any speaking state
    setSpeaking(new Set());
  }, [clearHistory, setModelsData]);

  // Orchestrator auto mode state
  type OrchestratorAutoScope = 'all' | 'self-hosted' | 'api';
  const [orchestratorAutoMode, setOrchestratorAutoMode] = useState(true);
  const [orchestratorAutoScope, setOrchestratorAutoScope] = useState<OrchestratorAutoScope>('api');
  const [showOrchestratorMenu, setShowOrchestratorMenu] = useState(false);
  const orchestratorMenuRef = useRef<HTMLDivElement>(null);

  // Close orchestrator menu on click outside or ESC
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orchestratorMenuRef.current && !orchestratorMenuRef.current.contains(e.target as Node)) {
        setShowOrchestratorMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowOrchestratorMenu(false);
      }
    };

    if (showOrchestratorMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showOrchestratorMenu]);

  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [, setDiscussionTurnsByModel] = useState<Record<string, Array<{
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

  // Analyze/Debate synthesis is handled by backend streams.

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
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (selectedCardIds.size > 0) {
          clearSelection();
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

      // Cmd+A / Ctrl+A to select all visible cards (only if not in chat mode)
      if ((event.metaKey || event.ctrlKey) && (event.key === 'a' || event.key === 'A')) {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        if (mode === 'chat') return; // Chat handles its own selection

        event.preventDefault();

        // Select all active models
        // Note: In visual modes, 'selected' array contains the active model IDs
        if (selected.length > 0) {
          setSelectedCardIds(new Set(selected));
        }
        return;
      }

      // Don't trigger keyboard shortcuts if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const order: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
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
        clearSelection();
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
    contextMenu,
    selectedCardIds,
    mode,
    handleModeChange,
    clearSelection,
  ]);

  // Handle wheel scroll to move arena up/down
  // Helpers for Arena Scrolling (Hoisted for HandBackground access)
  const touchActiveRef = useRef(false);
  const lastTouchYRef = useRef(0);

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

  // Handle wheel scroll to move arena up/down
  useEffect(() => {
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
      touchActiveRef.current = true;
      lastTouchYRef.current = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (dragSelectionActiveRef.current) return;
      if (!touchActiveRef.current || event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (shouldIgnoreTouch(target)) {
        touchActiveRef.current = false;
        return;
      }

      const touchY = event.touches[0].clientY;
      const deltaY = touchY - lastTouchYRef.current;
      lastTouchYRef.current = touchY;

      event.preventDefault();
      arenaTargetYRef.current = clampTarget(arenaTargetYRef.current + deltaY);
      ensureRaf();
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
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
    'dots',
    {
      serialize: value => value,
      deserialize: (stored, fallback) =>
        stored && BG_STYLES.includes(stored as BackgroundStyle)
          ? (stored as BackgroundStyle)
          : fallback,
    },
  );

  const moderatorModel = modelsData.find(m => m.id === moderator);

  const orchestratorStatus = isSynthesizing
    ? 'responding'
    : isGenerating
      ? 'waiting'
      : moderatorSynthesis
        ? 'done'
        : 'idle';

  // Simplified orchestrator label - detailed phase now shown in transcript panel
  const orchestratorPhaseLabel = isSynthesizing
    ? 'Synthesizing...'
    : isGenerating
      ? 'Observing'
      : moderatorSynthesis
        ? 'Complete'
        : 'Ready';

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
        const verticalOffset = mode === 'analyze' ? layoutRadius - 64 : 0;
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

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setIsSynthesizing(false);
    }
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
      {/* 
       * HandBackground rendered at Playground level for correct z-index stacking.
       * This is controlled by GestureControl (in Header) via GestureContext.
       * Renders BEHIND UI elements with glass-like effect.
       */}
      {gestureCtx.isActive && !gestureCtx.mouseSimulation && (
        <Suspense fallback={null}>
          <HandBackground
            onStopGeneration={gestureCtx.callbacks.current.onStopGeneration}
            onSendMessage={gestureCtx.callbacks.current.onSendMessage}
            onScroll={gestureCtx.callbacks.current.onScroll}
            onPinch={gestureCtx.callbacks.current.onPinch}
            onHover={gestureCtx.callbacks.current.onHover}
            onModeChange={gestureCtx.callbacks.current.onModeChange}
            config={gestureCtx.gestureConfig}
            mode={gestureCtx.gestureMode}
            appContext={gestureCtx.appContext}
            onGestureModeToggle={() => gestureCtx.setGestureMode(gestureCtx.gestureMode === 'navigation' ? 'asl' : 'navigation')}
            // Restrict message gestures (thumbs up/down, wave, etc.) to the transcript panel area
            // Panel is 400px (xl: 480px) on the right side - approximate as rightmost 30% of screen
            gestureActiveArea={{ minX: 0.70, maxX: 1.0, minY: 0, maxY: 1.0 }}
            // Feedback callbacks - write to context for GestureControl UI
            onGestureState={gestureCtx.setGestureState}
            onASLResult={gestureCtx.setASLResult}
            onError={gestureCtx.setCameraError}
            onDebugInfo={gestureCtx.setDebugInfo}
            onLandmarkData={gestureCtx.setLandmarkData}
            onPerformance={gestureCtx.setPerformanceMetrics}
          />
        </Suspense>
      )}

      {/* Loading overlay while models are being fetched */}
      {isLoadingModels && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative">
              <div className="w-12 h-12 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-b-emerald-500/50 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <div className="space-y-1.5">
              <p className="text-white/80 text-sm font-medium">
                {modelsLoadError || 'Connecting to models...'}
              </p>
              {modelsRetryCount > 0 && (
                <p className="text-white/40 text-xs tabular-nums">
                  Attempt {modelsRetryCount} of 8
                </p>
              )}
            </div>
            <button
              onClick={retryModelsNow}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Now
            </button>
          </div>
        </div>
      )}
      {/* Header - centered within the dotted background area */}
      <Header
        mode={mode}
        setMode={handleModeChange}
        setHoveredCard={setHoveredCard}
        clearSelection={clearSelection}
        showDock={showDock}
        setShowDock={setShowDock}
        onOpenSettings={() => setShowSettings(true)}
        gestureButtonSlot={
          <Suspense fallback={null}>
            <GestureControl
              inHeader={true}
              appContext={mode}
              onStopGeneration={() => {
                if (mode === 'chat' && chatViewRef.current) {
                  chatViewRef.current.stopGeneration();
                  return;
                }
                handleStop();
              }}
              onSendMessage={(msg) => {
                if (mode === 'chat' && chatViewRef.current) {
                  chatViewRef.current.sendMessage(msg, true); // fromGesture = true
                  return;
                }

                // Don't populate input box for gesture-triggered messages - just send directly
                const activeIds = mode === 'compare'
                  ? selected
                  : mode === 'analyze' || mode === 'debate'
                    ? selected
                    : [];

                if (activeIds.length > 0) {
                  sendMessage(msg, {}, activeIds);
                }
              }}
              onScroll={(deltaY) => {
                // Chat mode uses its own scroll container
                if (mode === 'chat' && chatViewRef.current) {
                  chatViewRef.current.scroll(deltaY);
                  return;
                }
                // Other modes use arena scrolling
                arenaTargetYRef.current = clampTarget(arenaTargetYRef.current + deltaY);
                ensureRaf();
              }}
              onHover={(xOfScreen, yOfScreen) => {
                const hoverX = xOfScreen * window.innerWidth;
                const hoverY = yOfScreen * window.innerHeight;

                const el = document.elementFromPoint(hoverX, hoverY) as HTMLElement;
                if (el) {
                  // Check if hovering over mode track
                  const modeTrack = el.closest('[data-gesture-mode-track]') as HTMLElement;
                  if (modeTrack) {
                    // Calculate which mode based on horizontal position
                    const rect = modeTrack.getBoundingClientRect();
                    const relativeX = hoverX - rect.left;
                    const trackWidth = rect.width;
                    const modeIndex = Math.floor((relativeX / trackWidth) * 5); // 5 modes
                    const modes: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
                    const targetMode = modes[Math.max(0, Math.min(4, modeIndex))];

                    if (targetMode && targetMode !== mode) {
                      handleModeChange(targetMode);
                    }
                    return;
                  }

                  // Get the current hovered element stored in a data attribute
                  const currentHovered = document.querySelector('[data-gesture-hovered="true"]') as HTMLElement;

                  // Find the interactive element or just use the element itself
                  const interactive = el.closest('button, a, [role="button"], [data-clickable], .cursor-pointer, [onclick]') as HTMLElement || el;

                  if (interactive !== currentHovered) {
                    // Pointer/Mouse leave on previous element
                    if (currentHovered) {
                      currentHovered.removeAttribute('data-gesture-hovered');
                      currentHovered.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, cancelable: true }));
                      currentHovered.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: true }));
                      currentHovered.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
                    }

                    // Pointer/Mouse enter on new element
                    interactive.setAttribute('data-gesture-hovered', 'true');
                    interactive.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                  } else if (interactive === currentHovered) {
                    // Still hovering same element, dispatch pointermove for continuous tracking
                    interactive.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                    interactive.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY }));
                  }
                }
              }}
              onPinch={(xOfScreen, yOfScreen) => {
                const clickX = xOfScreen * window.innerWidth;
                const clickY = yOfScreen * window.innerHeight;

                const el = document.elementFromPoint(clickX, clickY) as HTMLElement;
                if (el) {
                  // Dispatch pointer and mouse events on the target element
                  // This ensures compatibility with both pointer-based (cards) and mouse-based (buttons) handlers
                  const dispatchClickEvents = (target: HTMLElement) => {
                    // Pointer events (for cards and modern UI)
                    target.dispatchEvent(new PointerEvent('pointerdown', {
                      bubbles: true, cancelable: true, clientX: clickX, clientY: clickY,
                      pointerId: 1, pointerType: 'touch', isPrimary: true
                    }));
                    target.dispatchEvent(new PointerEvent('pointerup', {
                      bubbles: true, cancelable: true, clientX: clickX, clientY: clickY,
                      pointerId: 1, pointerType: 'touch', isPrimary: true
                    }));

                    // Mouse events (for traditional buttons and links)
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
                  };

                  // Find clickable elements: buttons, links, cards, anything with click handlers
                  const clickable = el.closest('button, a, [role="button"], [data-clickable], .cursor-pointer, [onclick]') as HTMLElement;

                  if (clickable) {
                    dispatchClickEvents(clickable);
                  } else {
                    // If no clickable found, try clicking the element directly (works for cards)
                    dispatchClickEvents(el);
                  }

                  // Visual feedback ripple
                  const ripple = document.createElement('div');
                  ripple.style.position = 'fixed';
                  ripple.style.left = `${clickX}px`;
                  ripple.style.top = `${clickY}px`;
                  ripple.style.width = '20px';
                  ripple.style.height = '20px';
                  ripple.style.background = 'rgba(236, 72, 153, 0.5)';
                  ripple.style.borderRadius = '50%';
                  ripple.style.transform = 'translate(-50%, -50%)';
                  ripple.style.pointerEvents = 'none';
                  ripple.style.zIndex = '9999';
                  document.body.appendChild(ripple);

                  ripple.animate([
                    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                    { transform: 'translate(-50%, -50%) scale(4)', opacity: 0 }
                  ], { duration: 400 }).onfinish = () => ripple.remove();
                }
              }}
              onModeChange={(direction) => {
                const modes: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
                const currentIndex = modes.indexOf(mode);
                let nextIndex: number;
                if (direction === 'next') {
                  nextIndex = (currentIndex + 1) % modes.length;
                } else {
                  nextIndex = (currentIndex - 1 + modes.length) % modes.length;
                }
                handleModeChange(modes[nextIndex]);
              }}
            />
          </Suspense>
        }
      />

      {/* Content Wrapper with Sidebar Offset */}
      <div
        style={{
          paddingLeft: '1.5rem',
          paddingRight: '0',
        }}
      >
        {/* Dock Backdrop */}
        {showDock && (
          <div
            className="fixed inset-0 z-[55] bg-black/10 backdrop-blur-[1px] transition-opacity duration-300"
            onClick={() => setShowDock(false)}
          />
        )}

        {/* Model Dock (Left) - Available in all modes */}
        <ModelDock
          showDock={showDock}
          availableModels={availableModels}
          allSelectedByType={allSelectedByType}
          totalModelsByType={totalModelsByType}
          handleDragStart={handleDockDragStart}
          handleModelToggle={handleModelToggle}
          handleAddGroup={handleAddGroup}
          dockRef={dockRef}
          mode={mode}
          allModels={modelsData}
          chatModelId={chatModelId}
          setChatModelId={setChatModelId}
          chatAutoMode={chatAutoMode}
          setChatAutoMode={setChatAutoMode}
          chatAutoModeScope={chatAutoModeScope}
          setChatAutoModeScope={setChatAutoModeScope}
          setShowDock={setShowDock}
        />



        {/* Chat View */}
        {mode === 'chat' && (
          <>
            <div className="flex h-screen w-full relative z-[10]">
              <div className="flex-1 relative px-2 sm:px-6 pt-20 pb-6">
                <ErrorBoundary>
                  <Suspense fallback={<div className="flex items-center justify-center h-full text-white/50 gap-2"><div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />Loading...</div>}>
                    <ChatView
                      ref={chatViewRef}
                      models={modelsData}
                      selectedModelId={chatModelId}
                      onSelectModel={setChatModelId}
                      githubToken={githubToken}
                      openrouterKey={openrouterKey}
                      messages={chatMessages}
                      setMessages={setChatMessages}
                      autoMode={chatAutoMode}
                      setAutoMode={setChatAutoMode}
                      autoModeScope={chatAutoModeScope}
                      setAutoModeScope={setChatAutoModeScope}
                      currentResponse={chatCurrentResponse}
                      setCurrentResponse={setChatCurrentResponse}
                      isGenerating={chatIsGenerating}
                      setIsGenerating={setChatIsGenerating}
                      onModelUsed={setChatModelId}
                      gesturesActive={gestureCtx.isActive}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </>
        )}

        {/* Main Content Area (Arena/Transcript) - Hidden in Chat Mode */}
        {mode !== 'chat' && (
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
                className={`relative w-full h-full z-10 transition-all duration-300`}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: mode === 'compare' ? 'flex-start' : 'center',
                  justifyContent: 'center',
                  ['--arena-offset-y' as any]: `${arenaOffsetYRef.current}px`,
                  transform: mode === 'analyze' || mode === 'debate'
                    ? `translateY(calc(var(--arena-offset-y) - 50px)) scale(${isDraggingOver ? 1.02 : 1})`
                    : `translateY(var(--arena-offset-y)) scale(${isDraggingOver ? 1.02 : 1})`,
                  willChange: 'transform',
                  border: isDraggingOver ? '2px dashed rgba(59, 130, 246, 0.4)' : '2px dashed transparent',
                  borderRadius: isDraggingOver ? '24px' : '0px',
                  transition: 'transform 0s linear',

                  // Mode-specific styles override base
                  ...(mode === 'compare' ? {
                    minHeight: '300px', // Minimum height to ensure clickable background
                    paddingBottom: '120px', // Extra space at bottom for right-click menu access
                  } : mode === 'analyze' || mode === 'debate' ? {
                    height: '100%',
                    minHeight: '100%',
                    overflow: 'hidden', // Prevent scroll in arena for multi-model modes
                  } : {
                    height: '100%',
                    minHeight: '100%',
                    overflow: 'hidden'
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
                  orchestratorAutoMode={orchestratorAutoMode}
                  orchestratorAutoScope={orchestratorAutoScope}
                  showOrchestratorMenu={showOrchestratorMenu}
                  setShowOrchestratorMenu={setShowOrchestratorMenu}
                  setOrchestratorAutoMode={setOrchestratorAutoMode}
                  setOrchestratorAutoScope={setOrchestratorAutoScope}
                  orchestratorMenuRef={orchestratorMenuRef}
                  availableModels={availableModels}
                  setModerator={setModerator}
                />
              </div>
            </div>

            {/* Right Panel: Transcript (Analyze, Debate modes only) */}
            {mode !== 'compare' && (
              <div className="transcript-panel w-[400px] xl:w-[480px] flex flex-col border-l border-white/5 bg-slate-900/20 backdrop-blur-sm z-40 relative h-full">
                <Suspense fallback={null}>
                  <DiscussionTranscript
                    history={history}
                    models={modelsData}
                    mode={mode}
                    onSelectPrompt={(prompt) => {
                      if (inputRef.current) {
                        inputRef.current.value = prompt;
                        inputRef.current.focus();
                      }
                    }}
                    onNewSession={handleNewSession}
                    className="pt-24 pb-6 mask-fade-top"
                    phaseLabel={phaseLabel}
                    isGenerating={isGenerating}
                    isSynthesizing={isSynthesizing}
                    speakingCount={speaking.size}
                    totalParticipants={selectedModels.length}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Selection rectangle overlay - positioned relative to root container */}
      <SelectionOverlay rect={selectionRect} />

      {/* API Limit Toast Notification */}
      {apiLimitToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-md shadow-xl">
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-amber-100">{apiLimitToast}</span>
            <button
              onClick={() => {
                setApiLimitToast(null);
                setShowSettings(true);
              }}
              className="ml-2 px-3 py-1 text-xs font-medium text-amber-900 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors"
            >
              Open Settings
            </button>
            <button
              onClick={() => setApiLimitToast(null)}
              className="ml-1 p-1 text-amber-400/60 hover:text-amber-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          token={githubToken}
          setToken={setGithubToken}
          openrouterKey={openrouterKey}
          setOpenrouterKey={setOpenrouterKey}
          bgStyle={bgStyle}
          setBgStyle={setBgStyle}
        />
      </Suspense>

      {/* Fixed Prompt Input for Compare, Analyze, and Debate Modes */}
      {
        (mode === 'compare' || mode === 'analyze' || mode === 'debate') && (
          <PromptInput
            inputRef={inputRef}
            inputFocused={inputFocused}
            setInputFocused={setInputFocused}
            onSendMessage={sendMessage}
            isGenerating={isGenerating || isSynthesizing}
            onStop={handleStop}
            placeholder={mode === 'compare' ? undefined : "Steer the discussion..."}
            className={`fixed bottom-0 left-0 z-[100] pb-6 px-3 sm:px-4 flex justify-center items-end pointer-events-none transition-all duration-300 ${mode === 'compare' ? 'right-0' : 'right-[400px] xl:right-[480px]'}`}
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          />
        )
      }

      {/* Custom Context Menu */}
      {
        contextMenu && (
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
                {/* Set as first responder - only in multi-model modes and not already set */}
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
        )
      }

    </div >
  );
}

// Wrapper component that provides GestureContext
export default function Playground() {
  return (
    <GestureProvider>
      <PlaygroundInner />
    </GestureProvider>
  );
}
