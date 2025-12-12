import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Model, Mode, Position, BackgroundStyle } from './types';
import { MODEL_META, BG_STYLES, MODE_COLORS, GENERATION_DEFAULTS, LAYOUT } from './constants';
import Typewriter from './components/Typewriter';
import ModelDock from './components/ModelDock';
import PromptInput from './components/PromptInput';
import Header from './components/Header';
import ExecutionTimeDisplay, { ExecutionTimeData } from './components/ExecutionTimeDisplay';
import ResponseInspector from './components/ResponseInspector';
import SettingsModal from './components/SettingsModal';
import { fetchChatStream, fetchCouncilStream, fetchDiscussionStream, streamSseEvents } from './utils/streaming';
import StatusIndicator from './components/StatusIndicator';
import TopicsDrawer from './components/TopicsDrawer';

interface ModelsApiModel {
  id: string;
  name?: string;
  type?: string;
}

interface ModelsApiResponse {
  models: ModelsApiModel[];
}

type ChatHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
  kind?: 'compare_summary' | 'council_synthesis' | 'roundtable_synthesis';
};

export default function Playground() {
  const [modelsData, setModelsData] = useState<Model[]>([]);
  const [mode, setMode] = useState<Mode>('compare');
  const [selected, setSelected] = useState<string[]>([]);
  const [moderator, setModerator] = useState<string>('');

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
  const [githubToken, setGithubToken] = useState<string>(() => {
    try {
      return localStorage.getItem('github_models_token') || '';
    } catch { return ''; }
  });

  const [inspectorPosition, setInspectorPosition] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('inspector_position') as 'left' | 'right') || 'right';
  });

  useEffect(() => {
    localStorage.setItem('inspector_position', inspectorPosition);
  }, [inspectorPosition]);

  // Execution time tracking: { modelId: { startTime, firstTokenTime, endTime } }
  const [executionTimes, setExecutionTimes] = useState<Record<string, ExecutionTimeData>>({});
  const dockRef = useRef<HTMLDivElement>(null); // Ref for the Model Dock

  const abortControllerRef = useRef<AbortController | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [_conversationHistory, setConversationHistory] = useState<ChatHistoryEntry[]>([]);
  const conversationHistoryRef = useRef<ChatHistoryEntry[]>([]);

  const pushHistoryEntries = (entries: ChatHistoryEntry[]) => {
    if (!entries.length) return;
    const next = [...conversationHistoryRef.current, ...entries];
    conversationHistoryRef.current = next;
    setConversationHistory(next);
  };

  const historyToText = (history: ChatHistoryEntry[]) =>
    history.map(entry => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`).join('\n\n');

  const buildCarryoverHistory = (history: ChatHistoryEntry[], targetMode: Mode) => {
    if (targetMode === 'compare') return history;

    const users = history.filter(e => e.role === 'user');
    const lastSynthesis = [...history]
      .reverse()
      .find(e =>
        e.role === 'assistant'
        && (e.kind === 'council_synthesis' || e.kind === 'roundtable_synthesis')
        && e.content.trim().length > 0
      );

    return lastSynthesis ? [...users, lastSynthesis] : users;
  };

  const modelIdToName = (id: string) => modelsData.find(m => m.id === id)?.name || id;

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

  // Fetch models from API
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then((data: ModelsApiResponse) => {
        const apiModels = data.models.map((m) => {
          const modelType: 'local' | 'api' = m.type === 'api' ? 'api' : 'local';
          const meta = MODEL_META[modelType];
          return {
            id: m.id,
            name: meta.name || m.name || m.id, // Use meta name or API name
            color: meta.color,
            type: modelType,
            response: "Ready to generate..."
          };
        });
        setModelsData(apiModels);

        // Select only local models by default
        const defaultSelectedIds = apiModels.filter((m: Model) => m.type === 'local').map((m: Model) => m.id);
        setSelected(defaultSelectedIds);

        // Set default moderator to an API model if available, otherwise the first model
        const apiModeratorCandidate = apiModels.find((m: Model) => m.type === 'api');
        if (apiModeratorCandidate) {
          setModerator(apiModeratorCandidate.id);
        } else if (apiModels.length > 0) {
          setModerator(apiModels[0].id);
        }
      })
      .catch(err => console.error("Failed to fetch models:", err));
  }, []);

  // Persist optional GitHub token in browser (same key as chat mode)
  useEffect(() => {
    try {
      if (githubToken) {
        localStorage.setItem('github_models_token', githubToken);
      } else {
        localStorage.removeItem('github_models_token');
      }
    } catch {
      // Ignore storage errors (e.g., private mode)
    }
  }, [githubToken]);

  // Available models are those in CONFIG but NOT in selected
  const availableModels = modelsData.filter(m => !selected.includes(m.id));

  const totalModelsByType = {
    local: modelsData.filter(m => m.type === 'local').length,
    api: modelsData.filter(m => m.type === 'api').length,
  };
  const selectedModelsByType = {
    local: modelsData.filter(m => m.type === 'local' && selected.includes(m.id)).length,
    api: modelsData.filter(m => m.type === 'api' && selected.includes(m.id)).length,
  };
  const allSelectedByType = {
    local: totalModelsByType.local > 0 && selectedModelsByType.local === totalModelsByType.local,
    api: totalModelsByType.api > 0 && selectedModelsByType.api === totalModelsByType.api,
  };

  // Map selected IDs to models to preserve user-defined order (important for drag-and-drop)
  const selectedModels = selected
    .map(id => modelsData.find(m => m.id === id))
    .filter((m): m is Model => !!m && (mode === 'compare' || m.id !== moderator));

  // Dynamic layout radius calculation (Moved up for scope access in drag handlers)
  const layoutRadius = mode === 'compare' ? 0 : Math.max(LAYOUT.baseRadius, LAYOUT.minRadius + selectedModels.length * LAYOUT.radiusPerModel);

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
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [activeInspectorId, setActiveInspectorId] = useState<string | null>(null);
  const [pinnedModels, setPinnedModels] = useState<Set<string>>(new Set()); // Set of pinned model IDs
  const [dragSelection, setDragSelection] = useState<{
    origin: { x: number; y: number };
    current: { x: number; y: number };
    active: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visualizationAreaRef = useRef<HTMLDivElement>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressClickRef = useRef(false);
  const thinkingStateRef = useRef<Record<string, { inThink: boolean; carry: string }>>({});
  const sessionModelIdsRef = useRef<string[]>([]);
  const dragSelectionActiveRef = useRef(false);
  const pendingStreamRef = useRef<Record<string, { answer: string; thinking: string }>>({});
  const flushStreamRafRef = useRef<number | null>(null);

  const handleSelectPrompt = (prompt: string) => {
    if (inputRef.current) {
      inputRef.current.value = prompt;
      inputRef.current.focus();
      setInputFocused(true);
    }
    setShowTopics(false);
  };

  const flushPendingStream = () => {
    flushStreamRafRef.current = null;
    const pending = pendingStreamRef.current;
    pendingStreamRef.current = {};
    const ids = Object.keys(pending);
    if (ids.length === 0) return;

    setModelsData(prev => prev.map(m => {
      const delta = pending[m.id];
      if (!delta) return m;
      return {
        ...m,
        response: m.response + delta.answer,
        thinking: (m.thinking || '') + delta.thinking,
      };
    }));
  };

  const scheduleFlushPendingStream = () => {
    if (flushStreamRafRef.current == null) {
      flushStreamRafRef.current = requestAnimationFrame(flushPendingStream);
    }
  };

  const enqueueStreamDelta = (modelId: string, answerAdd: string, thinkingAdd: string) => {
    if (!answerAdd && !thinkingAdd) return;
    const existing = pendingStreamRef.current[modelId] || { answer: '', thinking: '' };
    existing.answer += answerAdd;
    existing.thinking += thinkingAdd;
    pendingStreamRef.current[modelId] = existing;
    scheduleFlushPendingStream();
  };

  const clearPendingStreamForModel = (modelId: string) => {
    if (pendingStreamRef.current[modelId]) {
      delete pendingStreamRef.current[modelId];
    }
  };

  /* Drag & Drop State (Pointer Events) */
  const [dragState, setDragState] = useState<{
    activeId: string;
    startX: number;
    startY: number;
    // Current pointer position in screen coordinates
    currX: number;
    currY: number;
    // The initial visual offset of the card center relative to pointer
    offsetX: number;
    offsetY: number;
    // Container metrics to calculate relative transform
    containerLeft: number;
    containerTop: number;
    containerWidth: number;
    containerHeight: number;
    // Card metrics for accurate positioning
    cardHeight: number;
  } | null>(null);

  // Handle pointer down to start dragging
  const handlePointerDown = (e: React.PointerEvent, modelId: string) => {
    // Ignore right clicks or if we are clicking interactive elements
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return;

    // Prevent default to avoid text selection and native drag
    e.preventDefault();

    const cardEl = cardRefs.current.get(modelId);
    if (!cardEl || !visualizationAreaRef.current) return;

    const rect = cardEl.getBoundingClientRect();
    const vizRect = visualizationAreaRef.current.getBoundingClientRect();

    // Calculate offset from the card's center to the pointer
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    setDragState({
      activeId: modelId,
      startX: e.clientX,
      startY: e.clientY,
      currX: e.clientX,
      currY: e.clientY,
      offsetX: centerX - e.clientX,
      offsetY: centerY - e.clientY,
      containerLeft: vizRect.left,
      containerTop: vizRect.top,
      containerWidth: vizRect.width,
      containerHeight: vizRect.height,
      cardHeight: rect.height,
    });

    // Capture pointer to ensure we get events even if mouse leaves window
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  // Global pointer move/up effects
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      // Update visual position
      setDragState(prev => prev ? { ...prev, currX: e.clientX, currY: e.clientY } : null);

      if (!visualizationAreaRef.current) return;

      // -- Reordering Logic --
      // Calculate cursor position relative to the grid container
      const vizRect = visualizationAreaRef.current.getBoundingClientRect();
      const currentIndex = selected.indexOf(dragState.activeId);

      let closestDist = Infinity;
      let closestIndex = -1;

      if (mode === 'compare') {
        // --- Grid Mode Logic ---
        // Center of container is x=0 in our grid coordinate system
        // Y=0 is the top of the container
        const relX = e.clientX - (vizRect.left + vizRect.width / 2);
        const relY = e.clientY - vizRect.top;

        const totalWidth = (LAYOUT.cardWidth + LAYOUT.gapX) * gridCols - LAYOUT.gapX;

        selected.forEach((_, idx) => {
          const r = Math.floor(idx / gridCols);
          const c = idx % gridCols;
          const slotX = c * (LAYOUT.cardWidth + LAYOUT.gapX) - totalWidth / 2 + LAYOUT.cardWidth / 2;
          const slotY = r * (LAYOUT.cardHeight + LAYOUT.gapY);

          // Slot center for distance calc
          const slotCenterX = slotX;
          const slotCenterY = slotY + LAYOUT.cardHeight / 2;

          const dist = (relX - slotCenterX) ** 2 + (relY - slotCenterY) ** 2;
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = idx;
          }
        });
      } else {
        // --- Circle Mode Logic ---
        // Both X and Y are relative to container center
        const relX = e.clientX - (vizRect.left + vizRect.width / 2);
        const relY = e.clientY - (vizRect.top + vizRect.height / 2);

        // Use the same radius logic as render
        const currentRadius = Math.max(LAYOUT.baseRadius, LAYOUT.minRadius + selected.length * LAYOUT.radiusPerModel);

        selected.forEach((_, idx) => {
          const pos = getCirclePosition(idx, selected.length, mode, currentRadius);
          // pos.x and pos.y are center-relative
          const dist = (relX - pos.x) ** 2 + (relY - pos.y) ** 2;
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = idx;
          }
        });
      }

      // If closest slot is different from current index, swap
      if (closestIndex !== -1 && closestIndex !== currentIndex) {
        const newSelected = [...selected];
        // Move item
        const [movedItem] = newSelected.splice(currentIndex, 1);
        newSelected.splice(closestIndex, 0, movedItem);
        setSelected(newSelected);
      }
    };

    const handlePointerUp = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, selected, gridCols, mode, layoutRadius]);

  useEffect(() => {
    return () => {
      if (flushStreamRafRef.current != null) {
        cancelAnimationFrame(flushStreamRafRef.current);
      }
    };
  }, []);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; modelId?: string; type?: 'background' } | null>(null);

  useEffect(() => {
    dragSelectionActiveRef.current = dragSelection != null;
  }, [dragSelection]);

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

  const sendMessage = async (
    text: string,
    previousResponses?: Record<string, string> | null,
    participantsOverride?: string[],
    options?: { skipHistory?: boolean }
  ) => {
    if (!text.trim() || (selected.length === 0 && !participantsOverride) || (isGenerating && !participantsOverride)) return;
    const skipHistory = options?.skipHistory ?? false;
    const userEntry: ChatHistoryEntry = { role: 'user', content: text };
    const baseHistory = skipHistory ? conversationHistoryRef.current : [...conversationHistoryRef.current, userEntry];
    if (!skipHistory) {
      pushHistoryEntries([userEntry]);
    }
    const carryoverHistory = buildCarryoverHistory(baseHistory, mode);
    const historyContext = historyToText(carryoverHistory);
    setLastQuery(text);
    const contextualQuery = historyContext
      ? `${historyContext}\n\nContinue the conversation above and respond to the latest user request.`
      : text;

    let sessionModelIds: string[];
    if (participantsOverride) {
      sessionModelIds = participantsOverride;
    } else {
      const selectionOverride = Array.from(selectedCardIds).filter(id =>
        selected.includes(id) && (mode === 'compare' || id !== moderator)
      );
      sessionModelIds = selectionOverride.length > 0 ? selectionOverride : selected.slice();
    }
    sessionModelIdsRef.current = sessionModelIds;

    const sessionResponses: Record<string, string> = {};
    const recordResponse = (modelId: string, text: string, opts?: { replace?: boolean; label?: string }) => {
      if (!text) return;
      const addition = opts?.label ? `${opts.label}: ${text}` : text;
      sessionResponses[modelId] = opts?.replace
        ? addition
        : (sessionResponses[modelId] ? `${sessionResponses[modelId]}\n\n${addition}` : addition);
    };

    const currentController = new AbortController();
    abortControllerRef.current = currentController;
    setIsGenerating(true);
    setIsSynthesizing(false);
    setHoveredCard(null);
    setPhaseLabel(null);
    setModeratorSynthesis('');
    setCouncilAggregateRankings(null);
    setDiscussionTurnsByModel({});
    resetFailedModels();
    currentDiscussionTurnRef.current = null;

    // Reset any pending streamed chunks from a previous run.
    pendingStreamRef.current = {};
    if (flushStreamRafRef.current != null) {
      cancelAnimationFrame(flushStreamRafRef.current);
      flushStreamRafRef.current = null;
    }

    // Prepare UI state for streaming
    setModelsData(prev => prev.map(m => {
      if (sessionModelIds.includes(m.id) || m.id === moderator) {
        // Validation: If passing previousResponses, preserve valid responses
        if (previousResponses && previousResponses[m.id]) {
          return { ...m, response: previousResponses[m.id], thinking: undefined, error: undefined };
        }
        return { ...m, response: '', thinking: undefined, error: undefined };
      }
      return m;
    }));

    // Reset execution times for new run
    setExecutionTimes(prev => {
      const next = { ...prev };
      const startTime = performance.now();
      sessionModelIds.forEach(id => {
        // Keep old times if we have a previous response? Maybe not critical.
        // Doing a full reset is safer for now.
        next[id] = { startTime: startTime };
      });
      if (moderator && !next[moderator]) {
        next[moderator] = { startTime: startTime };
      }
      return next;
    });

    // Reset thinking state for streaming
    const thinkingResetIds = new Set(sessionModelIds);
    if (moderator) thinkingResetIds.add(moderator);
    thinkingResetIds.forEach(modelId => {
      thinkingStateRef.current[modelId] = { inThink: false, carry: '' };
    });

    // Track which models have received their first token
    const firstTokenReceived = new Set<string>();

    const applyThinkingChunk = (modelId: string, rawChunk: string) => {
      const state = thinkingStateRef.current[modelId] || { inThink: false, carry: '' };
      let textChunk = state.carry + rawChunk;
      state.carry = '';

      const lastLt = textChunk.lastIndexOf('<');
      if (lastLt !== -1 && textChunk.length - lastLt < 8) {
        const tail = textChunk.slice(lastLt);
        if ('<think>'.startsWith(tail) || '</think>'.startsWith(tail)) {
          state.carry = tail;
          textChunk = textChunk.slice(0, lastLt);
        }
      }

      let thinkingAdd = '';
      let answerAdd = '';
      let idx = 0;
      while (idx < textChunk.length) {
        if (!state.inThink) {
          const start = textChunk.indexOf('<think>', idx);
          if (start === -1) {
            answerAdd += textChunk.slice(idx);
            break;
          }
          answerAdd += textChunk.slice(idx, start);
          state.inThink = true;
          idx = start + 7;
        } else {
          const end = textChunk.indexOf('</think>', idx);
          if (end === -1) {
            thinkingAdd += textChunk.slice(idx);
            break;
          }
          thinkingAdd += textChunk.slice(idx, end);
          state.inThink = false;
          idx = end + 8;
        }
      }

      thinkingStateRef.current[modelId] = state;

      if (answerAdd) {
        recordResponse(modelId, answerAdd);
      }

      if (thinkingAdd || answerAdd) {
        enqueueStreamDelta(modelId, answerAdd, thinkingAdd);
      }
    };

    try {
      if (mode === 'compare') {
        setSpeaking(new Set(sessionModelIds));

        const response = await fetchChatStream({
          models: sessionModelIds,
          messages: baseHistory.map(msg => ({ role: msg.role, content: msg.content })),
          max_tokens: GENERATION_DEFAULTS.maxTokens,
          temperature: GENERATION_DEFAULTS.temperature,
          github_token: githubToken || null
        }, currentController.signal);

        await streamSseEvents(response, (data) => {
          if (data.event === 'token' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();

            if (!firstTokenReceived.has(modelId)) {
              firstTokenReceived.add(modelId);
              setExecutionTimes(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], firstTokenTime: now }
              }));
            }

            applyThinkingChunk(modelId, String(data.content ?? ''));
          }

          if (data.event === 'done' && data.model_id) {
            const now = performance.now();
            const modelId = data.model_id as string;
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now }
            }));
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
          }
        });
        if (!skipHistory) {
          const summary = summarizeSessionResponses(sessionResponses, sessionModelIds);
          if (summary) {
            pushHistoryEntries([{ role: 'assistant', content: summary, kind: 'compare_summary' }]);
          }
        }
        return;
      }

      if (mode === 'council') {
        const participants = sessionModelIds;
        if (participants.length < 2) {
          const msg = 'Select at least 2 participants for Council mode.';
          setModeratorSynthesis(msg);
          if (moderator) {
            setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: msg } : m));
          }
          setPhaseLabel('Error');
          return;
        }
        setSpeaking(new Set(participants));

        const effectiveChairman = participantsOverride && participants.length > 0
          ? participants[0]
          : (moderator || (participants.length > 0 ? participants[0] : null));

        const response = await fetchCouncilStream({
          query: contextualQuery,
          participants,
          chairman_model: effectiveChairman,
          max_tokens: GENERATION_DEFAULTS.maxTokens,
          github_token: githubToken || null,
          completed_responses: previousResponses || null,
        }, currentController.signal);

        let councilSynthesis = '';

        await streamSseEvents(response, (data) => {
          const eventType = data.event;

          if (eventType === 'stage1_start') {
            setPhaseLabel('Stage 1 · Responses');
          }

          if (eventType === 'model_start' && data.model_id) {
            // ...
          }

          if (eventType === 'model_chunk' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();

            if (!firstTokenReceived.has(modelId)) {
              firstTokenReceived.add(modelId);
              setExecutionTimes(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], firstTokenTime: now }
              }));
            }

            applyThinkingChunk(modelId, String((data as any).chunk ?? ''));
          }

          if (eventType === 'model_response' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now }
            }));
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });

            const responseText = String((data as any).response ?? '');
            recordResponse(modelId, responseText, { replace: true });
            if (previousResponses && previousResponses[modelId]) {
              // Already set
            } else {
              setModelsData(prev => prev.map(m => m.id === modelId ? { ...m, response: responseText } : m));
            }
          }

          if (eventType === 'model_error' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now }
            }));
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
            const errorText = String((data as any).error ?? 'Error generating response.');
            clearPendingStreamForModel(modelId);
            setModelsData(prev => prev.map(m => m.id === modelId ? { ...m, response: errorText, error: errorText } : m));
            markModelFailed(modelId);
            recordResponse(modelId, errorText, { replace: true });
          }

          if (eventType === 'stage2_start') {
            setPhaseLabel('Stage 2 · Anonymous Review');
            const activeParticipants = participants.filter(id => !failedModelsRef.current.has(id));
            setSpeaking(new Set(activeParticipants));
          }

          if (eventType === 'ranking_response' && data.model_id) {
            const modelId = data.model_id as string;
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
          }

          if (eventType === 'ranking_error' && data.model_id) {
            const modelId = data.model_id as string;
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
            // We don't necessarily show ranking errors in the card, but maybe log it?
            markModelFailed(modelId);
          }

          if (eventType === 'stage2_complete') {
            const aggregate = (data as any).aggregate_rankings as any[] | undefined;
            if (aggregate) setCouncilAggregateRankings(aggregate as any);
          }

          if (eventType === 'chairman_quip') {
            const quip = String((data as any).quip ?? '');
            setModeratorSynthesis(quip);
          }

          if (eventType === 'stage3_start') {
            setPhaseLabel('Stage 3 · Synthesis');
            setIsSynthesizing(true);
            setModeratorSynthesis('');
            if (moderator) setSpeaking(new Set([moderator]));
          }

          if (eventType === 'stage3_complete' || eventType === 'stage3_error') {
            const synthesis = String((data as any).response ?? (data as any).error ?? 'Synthesis error.');
            setModeratorSynthesis(synthesis);
            councilSynthesis = synthesis;
            if (moderator) {
              clearPendingStreamForModel(moderator);
              setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: synthesis } : m));
              recordResponse(moderator, synthesis, { replace: true });
            }
            setIsSynthesizing(false);
          }

          if (eventType === 'council_complete') {
            setPhaseLabel(null);
            setIsSynthesizing(false);
            setSpeaking(new Set());
            const aggregate = (data as any).aggregate_rankings as any[] | undefined;
            if (aggregate) setCouncilAggregateRankings(aggregate as any);
          }

          if (eventType === 'error') {
            const message = String((data as any).error ?? (data as any).message ?? 'Council error.');
            setModeratorSynthesis(message);
            if (moderator) {
              clearPendingStreamForModel(moderator);
              setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: message } : m));
            }
            setPhaseLabel('Error');
          }
        });
        if (!skipHistory) {
          const trimmed = councilSynthesis.trim();
          if (trimmed) {
            pushHistoryEntries([{ role: 'assistant', content: trimmed, kind: 'council_synthesis' }]);
          }
        }
        return;
      }

      // Roundtable (discussion) mode
      // If the orchestrator model is selected, include it as a participant for consistency.
      const participants = sessionModelIds;
      if (participants.length < 2) {
        const msg = 'Select at least 2 participants for Roundtable mode.';
        setModeratorSynthesis(msg);
        if (moderator) {
          setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: msg } : m));
        }
        setPhaseLabel('Error');
        return;
      }
      setSpeaking(new Set(participants));
      if (moderator) setSpeaking(prev => new Set(prev).add(moderator));

      const response = await fetchDiscussionStream({
        query: contextualQuery,
        max_tokens: GENERATION_DEFAULTS.maxTokens,
        temperature: GENERATION_DEFAULTS.temperature,
        orchestrator_model: moderator || null,
        github_token: githubToken || null,
        participants,
        turns: 2
      }, currentController.signal);

      let currentTurn = 0;

      let roundtableSynthesis = '';

      await streamSseEvents(response, (data) => {
        const eventType = data.event;

        if (eventType === 'analysis_start') {
          setPhaseLabel('Analyzing Query');
        }

        if (eventType === 'analysis_complete') {
          setPhaseLabel('Orchestrating');
          if (data.analysis) {
            const analysisObj = data.analysis as any;
            const analysisText = String(analysisObj?.reasoning ?? analysisObj?.summary ?? 'Analysis complete.');
            setModeratorSynthesis(analysisText);
          }
        }

        if (eventType === 'turn_start') {
          currentTurn = (data as any).turn_number || currentTurn;
          setPhaseLabel(`Round ${currentTurn}`);
        }

        if (eventType === 'turn_chunk' && data.model_id) {
          const modelId = data.model_id as string;
          const now = performance.now();
          if (!firstTokenReceived.has(modelId)) {
            firstTokenReceived.add(modelId);
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], firstTokenTime: now }
            }));
          }
          if (currentDiscussionTurnRef.current?.modelId !== modelId) {
            currentDiscussionTurnRef.current = { modelId, turnNumber: currentTurn };
          }
          applyThinkingChunk(modelId, String(data.chunk ?? ''));
        }

        if (eventType === 'turn_complete' && data.model_id) {
          const modelId = data.model_id as string;
          const now = performance.now();
          if (modelId) {
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now }
            }));
          }
          const response = String((data as any).response ?? '');

          setDiscussionTurnsByModel(prev => {
            const existing = prev[modelId] || [];
            return {
              ...prev,
              [modelId]: [...existing, { turn_number: currentTurn, response }]
            };
          });

          // Update main card response
          setModelsData(prev => prev.map(m => m.id === modelId ? { ...m, response } : m));
          setSpeaking(new Set());
          recordResponse(modelId, response, { label: `Round ${currentTurn + 1}` });
        }

        if (eventType === 'turn_error' && data.model_id) {
          const modelId = data.model_id as string;
          const now = performance.now();
          setExecutionTimes(prev => ({
            ...prev,
            [modelId]: { ...prev[modelId], endTime: now }
          }));
          const errorText = String((data as any).error ?? 'Error generating response.');
          clearPendingStreamForModel(modelId);
          setModelsData(prev => prev.map(m => m.id === modelId ? { ...m, response: errorText } : m));
          setSpeaking(new Set());
          markModelFailed(modelId);
          recordResponse(modelId, errorText, { replace: true });
        }

        if (eventType === 'synthesis_start') {
          setPhaseLabel('Synthesis');
          setIsSynthesizing(true);
          if (moderator) setSpeaking(new Set([moderator]));
        }

        if (eventType === 'discussion_complete') {
          const synthesis = String((data as any).final_response ?? '');
          setModeratorSynthesis(synthesis);
          roundtableSynthesis = synthesis;
          if (moderator) {
            clearPendingStreamForModel(moderator);
            setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: synthesis } : m));
            recordResponse(moderator, synthesis, { replace: true });
          }
          setPhaseLabel(null);
          setIsSynthesizing(false);
          setSpeaking(new Set());
        }

        if (eventType === 'error') {
          const message = String((data as any).error ?? (data as any).message ?? 'Discussion error.');
          setModeratorSynthesis(message);
          if (moderator) {
            clearPendingStreamForModel(moderator);
            setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: message } : m));
          }
          setPhaseLabel('Error');
          setIsSynthesizing(false);
          setSpeaking(new Set());
        }
      });
      if (!skipHistory) {
        const trimmed = roundtableSynthesis.trim();
        if (trimmed) {
          pushHistoryEntries([{ role: 'assistant', content: trimmed, kind: 'roundtable_synthesis' }]);
        }
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Ignore usage aborts
        return;
      }
      console.error('Chat error:', err);
      // Only set error states if this is still the active controller
      if (abortControllerRef.current === currentController) {
        const errorMsg = (err as Error).message || String(err);
        setModeratorSynthesis(`Session Error: ${errorMsg}`);
        setPhaseLabel('Error');

        pendingStreamRef.current = {};
        if (flushStreamRafRef.current != null) {
          cancelAnimationFrame(flushStreamRafRef.current);
          flushStreamRafRef.current = null;
        }
        setModelsData(prev => prev.map(m =>
          sessionModelIds.includes(m.id) && !m.response ? { ...m, response: 'Error generating response.' } : m
        ));
        sessionModelIds.forEach(id => markModelFailed(id));
      }
    } finally {
      // ONLY reset state if we are still the active controller
      if (abortControllerRef.current === currentController) {
        const finalTime = performance.now();
        setExecutionTimes(prev => {
          const updated = { ...prev };
          sessionModelIdsRef.current.forEach(modelId => {
            if (updated[modelId] && !updated[modelId].endTime) {
              updated[modelId] = { ...updated[modelId], endTime: finalTime };
            }
          });
          return updated;
        });
        setIsGenerating(false);
        setIsSynthesizing(false);
        setPhaseLabel(prev => (prev === 'Error' ? prev : null));
        setSpeaking(new Set());
      }
    }
  };

  // Council/Roundtable synthesis is handled by backend streams.

  // Handle Escape key to close dock and Delete/Backspace to remove selected models
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape: unfocus input, close dock, clear hover
      if (event.key === 'Escape') {
        const target = event.target as HTMLElement;
        // If in an input, just blur it
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          (target as HTMLInputElement).blur();
          return;
        }
        // Otherwise close dock and clear selections
        if (showDock) setShowDock(false);
        setHoveredCard(null);
        return;
      }

      // Don't trigger keyboard shortcuts if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // 'M' toggles models dock
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        setShowDock(!showDock);
        return;
      }

      // Delete or Backspace removes selected cards from arena
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedCardIds.size > 0) {
        event.preventDefault();
        // Remove all selected cards from the arena
        setSelected(prev => prev.filter(id => !selectedCardIds.has(id)));
        setSelectedCardIds(new Set());
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
  }, [showDock, selectedCardIds]);

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

  // Load background style from localStorage or use default
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>(() => {
    const saved = localStorage.getItem('playground-bg-style');
    return (saved && BG_STYLES.includes(saved as BackgroundStyle))
      ? (saved as BackgroundStyle)
      : 'dots-mesh';
  });

  // Save background style to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('playground-bg-style', bgStyle);
  }, [bgStyle]);

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
    if (inspectorModels.length === 0) {
      if (activeInspectorId !== null) setActiveInspectorId(null);
      return;
    }
    if (!activeInspectorId || !selectedCardIds.has(activeInspectorId)) {
      setActiveInspectorId(inspectorModels[0].id);
    }
  }, [inspectorModels.length, selectedCardIds, activeInspectorId]);



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

  const getCirclePosition = (index: number, total: number, currentMode: Mode, radius: number): Position => {
    if (currentMode === 'council') {
      // Semi-circle (Parliament style)
      // Spread models across a ~220 degree arc to center them above the moderator
      // Range 250-470 minus 90 gives 160 to 380 degrees (Left-ish to Right-ish over the top)
      const startAngle = 250;
      const endAngle = 470;
      const angleRange = endAngle - startAngle;
      const angle = (startAngle + (index * angleRange / (total - 1))) - 90; // -90 to rotate 0 to top

      const rad = angle * Math.PI / 180;
      return {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        angle
      };
    }

    // Roundtable (Full Circle - existing logic)
    const angle = (index * 360 / total) - 90;
    const x = Math.cos(angle * Math.PI / 180) * radius;
    const y = Math.sin(angle * Math.PI / 180) * radius;
    return { x, y, angle };
  };

  const bgClass = bgStyle === 'none' ? '' : `bg-${bgStyle}`;

  const getTailSnippet = (text: string, maxChars: number = 280) => {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return `…${text.slice(text.length - maxChars)}`;
  };

  // Normalize rectangle coordinates
  const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    const bottom = Math.max(a.y, b.y);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  };

  // Calculate selection rectangle (relative to root container)
  const selectionRect = dragSelection && dragSelection.active
    ? (() => {
      const rect = normalizeRect(dragSelection.origin, dragSelection.current);
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
    })()
    : null;

  // Handle mouse down for selection box
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return; // Only left mouse button
      if (!rootContainerRef.current || !visualizationAreaRef.current) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Don't start selection if clicking on cards, buttons, inputs, or other interactive elements
      const clickedOnCard = target.closest('[data-card]');
      const clickedOnInteractive = target.closest('button, a, input, textarea, select, [role="button"]');
      const clickedOnDraggable = target.closest('[draggable]');
      const clickedInNoSelectArea = target.closest('[data-no-arena-scroll]');
      if (clickedOnCard || clickedOnInteractive || clickedOnDraggable || clickedInNoSelectArea) return;

      // Only allow selection within the root container
      const clickedOnContainer = rootContainerRef.current.contains(target);
      if (!clickedOnContainer) return;

      // Stop any scroll inertia so selection origin stays under cursor.
      arenaTargetYRef.current = arenaOffsetYRef.current;
      if (wheelRafRef.current != null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }

      const rootBounds = rootContainerRef.current.getBoundingClientRect();
      const point = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top
      };

      // Prevent text selection when starting drag
      event.preventDefault();

      dragSelectionActiveRef.current = true;
      suppressClickRef.current = false;
      setDragSelection({
        origin: point,
        current: point,
        active: false
      });
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    return () => window.removeEventListener('mousedown', handleMouseDown, true);
  }, []);

  // Handle mouse move and mouse up for selection box
  useEffect(() => {
    if (!dragSelection || !rootContainerRef.current || !visualizationAreaRef.current) return;

    // Prevent text selection during drag
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('selectstart', handleSelectStart);

    const handleMouseMove = (event: MouseEvent) => {
      const rootBounds = rootContainerRef.current!.getBoundingClientRect();
      const point = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top
      };

      setDragSelection((state) => {
        if (!state) return state;
        const rect = normalizeRect(state.origin, point);
        const active = state.active || rect.width > 4 || rect.height > 4;
        return { ...state, current: point, active };
      });
    };

    const handleMouseUp = (event: MouseEvent) => {
      dragSelectionActiveRef.current = false;
      const rootBounds = rootContainerRef.current!.getBoundingClientRect();
      const point = {
        x: event.clientX - rootBounds.left,
        y: event.clientY - rootBounds.top
      };

      const upTarget = event.target as HTMLElement | null;
      const willTriggerCardClick = Boolean(upTarget && upTarget.closest('[data-card]'));

      setDragSelection((state) => {
        if (!state) return null;

        const rect = normalizeRect(state.origin, point);
        let selectionRectScreen: { left: number; right: number; top: number; bottom: number } | null = null; // Declare here

        if (state.active && rect.width > 0 && rect.height > 0) {
          const matched: string[] = [];

          // Convert selection rect from root container coordinates to screen coordinates
          const currentRootBounds = rootContainerRef.current!.getBoundingClientRect();
          selectionRectScreen = { // Assign value here
            left: currentRootBounds.left + rect.left,
            right: currentRootBounds.left + rect.right,
            top: currentRootBounds.top + rect.top,
            bottom: currentRootBounds.top + rect.bottom
          };

          // Check all model cards
          for (const model of selectedModels) {
            const cardElement = cardRefs.current.get(model.id);
            if (!cardElement) continue;

            const cardBounds = cardElement.getBoundingClientRect();

            const intersects = !(
              cardBounds.right < selectionRectScreen!.left || // Use non-null assertion
              cardBounds.left > selectionRectScreen!.right ||
              cardBounds.bottom < selectionRectScreen!.top ||
              cardBounds.top > selectionRectScreen!.bottom
            );

            if (intersects) {
              matched.push(model.id);
            }
          }

          setSelectedCardIds(new Set(matched));
          if (matched.length > 0) {
            setActiveInspectorId(prev => (prev && matched.includes(prev)) ? prev : matched[0]);
          } else {
            setActiveInspectorId(null);
          }
          suppressClickRef.current = willTriggerCardClick;
        } else if (!state.active) {
          // Click without drag - keep only pinned models
          const onlyPinned = new Set([...selectedCardIds].filter(id => pinnedModels.has(id)));
          if (onlyPinned.size > 0) {
            setSelectedCardIds(onlyPinned);
            // Keep active inspector if it's pinned, otherwise clear
            if (activeInspectorId && !pinnedModels.has(activeInspectorId)) {
              setActiveInspectorId([...onlyPinned][0] || null);
            }
          } else {
            setSelectedCardIds(new Set());
            setActiveInspectorId(null);
          }
        }

        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectstart', handleSelectStart);
    };
  }, [dragSelection, selectedModels]);

  return (
    <div
      ref={rootContainerRef}
      className={`min-h-screen text-white relative overflow-hidden ${bgClass}`}
      style={{
        backgroundColor: MODE_COLORS[mode],
        transition: 'background-color 1s ease',
        ...(bgStyle === 'none' ? { background: MODE_COLORS[mode] } : {}),
        ...(dragSelection ? { userSelect: 'none', WebkitUserSelect: 'none' } : {}),
      }}
      onClick={(e) => {
        // Only deselect if clicking directly on the background
        if (e.target === e.currentTarget) {
          setHoveredCard(null);
        }
      }}
    >
      {/* Header */}
      <Header
        mode={mode}
        setMode={setMode}
        setHoveredCard={setHoveredCard}
        setDragSelection={setDragSelection}
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
          paddingTop: '4rem',
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

        {/* Main visualization area */}
        <div
          ref={visualizationAreaRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative w-full z-[40] transition-all duration-300 ${mode === 'compare' ? '' : ''}`}
          style={{
            // Base styles for all modes
            position: 'relative',
            display: 'flex',
            alignItems: mode === 'compare' ? 'flex-start' : 'center', // Top-align for grid to prevent upward growth
            justifyContent: 'center',
            ['--arena-offset-y' as any]: `${arenaOffsetYRef.current}px`,
            transform: `translateY(var(--arena-offset-y)) scale(${isDraggingOver ? 1.02 : 1})`,
            willChange: 'transform',
            border: isDraggingOver ? '2px dashed rgba(59, 130, 246, 0.4)' : '2px dashed transparent',
            borderRadius: isDraggingOver ? '24px' : '0px',
            transition: 'transform 0s linear',

            // Mode-specific styles override base
            ...(mode === 'compare' ? {} : {
              height: `${LAYOUT.arenaHeight}px`,
              minHeight: `${LAYOUT.arenaHeight}px`,
              maxHeight: '100vh',
            }),

            ...(isDraggingOver ? {
              background: 'rgba(59, 130, 246, 0.05)',
            } : {})
          }}
          onClick={(e) => {
            // Deselect if clicking on the background (cards use stopPropagation to prevent this)
            const target = e.target as HTMLElement;
            // Check if click is on background container or SVG elements (connection lines)
            const isSVG = target.tagName === 'svg' || target.closest('svg');
            if (e.target === e.currentTarget || (isSVG && !target.closest('[data-card]'))) {
              setHoveredCard(null);
              if (!suppressClickRef.current) {
                // Keep only pinned models
                const onlyPinned = new Set([...selectedCardIds].filter(id => pinnedModels.has(id)));
                if (onlyPinned.size > 0) {
                  setSelectedCardIds(onlyPinned);
                  if (activeInspectorId && !pinnedModels.has(activeInspectorId)) {
                    setActiveInspectorId([...onlyPinned][0] || null);
                  }
                } else {
                  setSelectedCardIds(new Set());
                }
              }
              suppressClickRef.current = false;
            }
          }}
          onContextMenu={(e) => {
            // Show background context menu only if clicking on actual background
            const target = e.target as HTMLElement;
            if (target.closest('[data-card]')) return; // Don't show if right-clicking on a card
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'background' });
          }}
        >
          {/* Model cards - rendered for all modes with transitions */}
          {selectedModels.map((model, index) => {
            const circlePos = getCirclePosition(index, selectedModels.length, mode, layoutRadius);
            const isCircle = mode !== 'compare';
            const isSpeaking = speaking.has(model.id); // Check set membership
            const isHovered = hoveredCard === model.id;
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
            const errorColor = '#ef4444'; // Red for errors
            const typeColor = model.type === 'local' ? '#10b981' : '#3b82f6'; // Green for local, blue for API
            const effectiveColor = hasError ? errorColor : typeColor; // Use type-based color
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

            // Calculate grid position for compare mode
            const cols = gridCols; // Use dynamic gridCols state
            const row = Math.floor(index / cols);
            const col = index % cols;
            const totalWidth = (LAYOUT.cardWidth + LAYOUT.gapX) * cols - LAYOUT.gapX;
            // GridY: Start from top (0) + row offset. Do NOT center vertically to avoid overlapping header.
            const gridY = mode === 'compare' ? row * (LAYOUT.cardHeight + LAYOUT.gapY) : 0;
            const gridX = mode === 'compare' ? col * (LAYOUT.cardWidth + LAYOUT.gapX) - totalWidth / 2 + LAYOUT.cardWidth / 2 : 0;

            const pos = isCircle ? circlePos : { x: gridX, y: gridY, angle: 0 };
            // In council mode, orchestrator sits at (0, layoutRadius - 64) relative to arena center
            const orchestratorYOffset = mode === 'council' ? layoutRadius - 64 : 0;
            const lineSize = Math.max(800, layoutRadius * 2 + 600);
            const lineCenter = lineSize / 2;
            // SVG is centered on the card. Line goes FROM card center TO orchestrator.
            // Card is at (circlePos.x, circlePos.y) in arena coords.
            // Orchestrator is at (0, orchestratorYOffset) in arena coords.
            // In SVG coords (centered on card): card = (lineCenter, lineCenter)
            // Orchestrator = lineCenter + (orchestratorX - cardX), lineCenter + (orchestratorY - cardY)
            const lineX1 = lineCenter; // card center
            const lineY1 = lineCenter;
            const lineX2 = lineCenter + (0 - circlePos.x); // orchestrator x relative to card
            const lineY2 = lineCenter + (orchestratorYOffset - circlePos.y); // orchestrator y relative to card

            // Determine if this card is being dragged
            const isDragging = dragState?.activeId === model.id;

            // Calculate Position
            let styleTransform = '';

            if (isDragging && dragState) {
              // Determine absolute position based on mouse - avoid transitions for instant follow
              const centerX_Screen = dragState.currX + dragState.offsetX;
              const centerY_Screen = dragState.currY + dragState.offsetY;

              if (mode === 'compare') {
                // Grid Mode: transform X is center-relative, Y is top-relative.
                // We want to place the Top-Left edge of the card.
                // But wait, our transform is `translate(calc(-50% + X), Y)`.
                // X is offset from center. Y is offset from top.
                // (-50%) on X shifts the center of the card to the anchor point.
                // So if X = 'distance from container center to card center', the card is centered there horizontally.
                // Y = 'distance from container top to card TOP'.

                const xRelative = centerX_Screen - (dragState.containerLeft + dragState.containerWidth / 2);

                // We have CenterY. We need TopY.
                // Use the captured cardHeight ensuring accurate offset even if card is taller than standard
                const topY_Relative = (centerY_Screen - dragState.containerTop) - (dragState.cardHeight / 2);

                styleTransform = `translate(calc(-50% + ${xRelative}px), ${topY_Relative}px)`;
              } else {
                // Circle Mode: transform is `translate(calc(-50% + X), calc(-50% + Y))`
                // Both X and Y are offsets from container center to card center.
                const xRelative = centerX_Screen - (dragState.containerLeft + dragState.containerWidth / 2);
                const yRelative = centerY_Screen - (dragState.containerTop + dragState.containerHeight / 2);

                styleTransform = `translate(calc(-50% + ${xRelative}px), calc(-50% + ${yRelative}px))`;
              }
            } else {
              // Not dragging - use slot position
              if (mode === 'compare') {
                styleTransform = `translate(calc(-50% + ${pos.x}px), ${pos.y}px)`;
              } else {
                styleTransform = `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`;
              }
            }

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
                  zIndex: isDragging || isHovered ? 100 : isSelected ? 20 : isSpeaking ? 10 : 1,
                  left: '50%',
                  top: mode === 'compare' ? '0' : '50%',
                  transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0, 0.2, 1)',
                }}
              >
                {/* Speaking glow effect */}
                {isSpeaking && isCircle && (
                  <div
                    className="absolute inset-0 rounded-full animate-pulse"
                    style={{
                      background: `radial-gradient(circle, ${processingColor}2b 0%, transparent 70%)`,
                      transform: 'scale(2)',
                      filter: 'blur(15px)'
                    }}
                  />
                )}

                {/* Card */}
                <div
                  data-card
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    const isMulti = e.metaKey || e.ctrlKey;
                    if (isMulti) {
                      const newSelection = new Set(selectedCardIds);
                      if (newSelection.has(model.id)) {
                        newSelection.delete(model.id);
                      } else {
                        newSelection.add(model.id);
                      }
                      setSelectedCardIds(newSelection);
                      setActiveInspectorId(model.id);
                    } else {
                      // Click opens full inspector
                      // Add this model to selection (alongside any pinned models)
                      const newSelection = new Set([...selectedCardIds].filter(id => pinnedModels.has(id)));
                      newSelection.add(model.id);
                      setSelectedCardIds(newSelection);
                      setActiveInspectorId(model.id);
                    }
                  }}
                  onMouseEnter={() => isCircle && setHoveredCard(model.id)}
                  onMouseLeave={() => isCircle && setHoveredCard(null)}
                  className={`relative cursor-grab active:cursor-grabbing card-hover ${isSelected ? 'card-selected' : ''} ${isSpeaking ? 'card-speaking' : ''}`}
                  style={{
                    background: cardBackground,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: cardBorder,
                    boxShadow: cardShadow,
                    transform: isSelected || isProcessing ? 'scale(1.05)' : 'scale(1)',
                    width: isCircle ? '96px' : '256px',
                    height: isCircle ? '96px' : '200px',
                    borderRadius: isCircle ? '50%' : '12px',
                    transition: 'transform 180ms ease-out, box-shadow 180ms ease-out, border-color 180ms ease-out, width 0.7s cubic-bezier(0.4, 0, 0.2, 1), height 0.7s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* Remove Button (Top Right) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleModelToggle(model.id);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 transition-all opacity-0 group-hover:opacity-100 z-50"
                    style={{ opacity: isSelected || isHovered ? 1 : undefined }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Grid mode content */}
                  {!isCircle && (
                    <div style={{
                      padding: '16px',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      isolation: 'isolate',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale',
                      textRendering: 'optimizeLegibility',
                      opacity: isCircle ? 0 : 1,
                      transition: 'opacity 0.3s ease-out'
                    }}>
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
                          {mode === 'compare' && moderator === model.id && (
                            <span
                              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/30"
                              title="Orchestrator used for Council/Roundtable"
                            >
                              Orchestrator
                            </span>
                          )}
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
                        {isSpeaking ? (
                          model.response.trim().length > 0 ? (
                            <Typewriter text={model.response} speed={20} />
                          ) : model.thinking && model.thinking.trim().length > 0 ? (
                            <span>
                              <span className="text-slate-500 italic">Thinking… </span>
                              {getTailSnippet(model.thinking.trim(), 220)}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Thinking…</span>
                          )
                        ) : (
                          model.response
                        )}
                      </p>
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50">
                        <ExecutionTimeDisplay times={executionTimes[model.id]} />
                      </div>
                    </div>
                  )}

                  {/* Circle mode content */}
                  {isCircle && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{
                      opacity: isCircle ? 1 : 0,
                      transition: 'opacity 0.3s ease-out'
                    }}>
                      <div className="text-center px-2">
                        <div className="text-[10px] font-semibold text-slate-200 leading-tight">{model.name}</div>
                        <div className="flex items-center justify-center mt-3">
                          <StatusIndicator state={statusState} color={effectiveColor} size={14} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Hover preview panel */}
                {isHovered && isCircle && (
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
                        {isSpeaking ? (
                          model.response.trim().length > 0 ? (
                            <Typewriter text={model.response} speed={20} />
                          ) : model.thinking && model.thinking.trim().length > 0 ? (
                            <span>
                              <span className="text-slate-500 italic">Thinking… </span>
                              {getTailSnippet(model.thinking.trim(), 280)}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Thinking…</span>
                          )
                        ) : model.response ? (
                          getTailSnippet(model.response)
                        ) : (
                          <span className="text-slate-500 italic">No response yet.</span>
                        )}
                      </p>
                      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-700/50">
                        <ExecutionTimeDisplay times={executionTimes[model.id]} />
                      </div>
                    </div>
                  )}

                {isSpeaking && mode !== 'compare' && !hasError && (
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

              </div>
            );
          })}

          {/* Orchestrator in center */}
          {mode !== 'compare' && moderatorModel && (
            <div
              data-card
              className="absolute z-20 transition-all duration-700 ease-out cursor-pointer"
              style={{
                opacity: 1,
                transform: orchestratorTransformWithScale,
                left: '50%',
                top: mode === 'council' ? `calc(50% + ${layoutRadius}px - 64px)` : '50%', // Align top edge with circle bottom
              }}
              onClick={(e) => {
                e.stopPropagation(); // Prevent background click handler from firing
                if (moderator) {
                  setSelectedCardIds(new Set([moderator]));
                  setActiveInspectorId(moderator);
                }
              }}
              onMouseEnter={() => setHoveredCard('moderator')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div className="relative w-24 h-24 flex items-center justify-center">
                {/* Outer glow rings */}
                <div
                  className="absolute inset-0 rounded-full animate-pulse"
                  style={{
                    background: `radial-gradient(circle, ${moderatorModel.color}20 0%, transparent 70%)`,
                    transform: 'scale(2)',
                    filter: 'blur(20px)'
                  }}
                />

                {/* Main moderator card */}
                <div
                  className="relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    backdropFilter: 'blur(16px)',
                    border: `2px solid ${moderatorModel.color}60`,
                    boxShadow: `0 0 40px ${moderatorModel.color}30, inset 0 1px 1px rgba(255,255,255,0.1)`
                  }}
                >
                  {/* Rotating ring */}
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

              {/* Hover preview synthesis */}
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
                    {moderatorSynthesis ? (
                      (isSynthesizing && moderator && speaking.has(moderator))
                        ? <Typewriter text={moderatorSynthesis} speed={20} />
                        : getTailSnippet(moderatorSynthesis)
                    ) : isSynthesizing ? (
                      <span className="text-slate-500 italic">Synthesizing responses...</span>
                    ) : isGenerating ? (
                      <span className="text-slate-500 italic">
                        {phaseLabel === 'Stage 1 · Responses' ? 'Waiting for model responses...' : (phaseLabel || 'Orchestrating...')}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Send a prompt to see the synthesis.</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
          {/* Connecting circle */}
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
          onClose={() => {
            // Close always works - clear selection but keep pinnedModels info
            setSelectedCardIds(new Set());
            setActiveInspectorId(null);
          }}
          speaking={speaking}
          mode={mode}
          moderatorId={moderator}
          councilAggregateRankings={councilAggregateRankings}
          discussionTurnsByModel={discussionTurnsByModel}
          pinned={pinnedModels.has(activeInspectorId)}
          onTogglePin={() => {
            const newPinned = new Set(pinnedModels);
            if (newPinned.has(activeInspectorId)) {
              newPinned.delete(activeInspectorId);
            } else {
              newPinned.add(activeInspectorId);
            }
            setPinnedModels(newPinned);
          }}
          position={inspectorPosition}
          onTogglePosition={() => setInspectorPosition(prev => prev === 'left' ? 'right' : 'left')}
        />
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        token={githubToken}
        setToken={setGithubToken}
      />

      <TopicsDrawer
        open={showTopics}
        onClose={() => setShowTopics(false)}
        onSelectPrompt={handleSelectPrompt}
      />

      <PromptInput
        inputRef={inputRef}
        inputFocused={inputFocused}
        setInputFocused={setInputFocused}
        onSendMessage={sendMessage}
        onOpenTopics={() => setShowTopics(true)}
      />

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-[200] min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'background' ? (
            // Background context menu
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
            // Model context menu
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
          ) : null}
        </div>
      )}

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); } /* Move by 1/3 since we tripled the content */
        }
        .animate-ticker {
          animation: ticker 40s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
        @keyframes flow {
          from { stroke-dashoffset: 10; }
          to { stroke-dashoffset: 0; }
        }
        .animate-flow {
          animation: flow 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-hover {
          will-change: transform;
        }
        .card-hover:hover:not(.card-selected):not(.card-speaking) {
          transform: scale(1.02) !important;
        }
        .card-hover.rounded-full:hover:not(.card-selected):not(.card-speaking) {
          transform: scale(1.05) !important;
        }
      `}</style>
      {dragSelection && (
        <style>{`
          body {
            user-select: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            cursor: crosshair !important;
          }
          input, textarea {
            user-select: text !important;
            -webkit-user-select: text !important;
            cursor: text !important;
          }
        `}</style>
      )}
    </div>
  );
}
