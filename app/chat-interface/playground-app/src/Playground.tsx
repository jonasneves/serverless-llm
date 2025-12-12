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

interface ModelsApiModel {
  id: string;
  name?: string;
  type?: string;
}

interface ModelsApiResponse {
  models: ModelsApiModel[];
}

export default function Playground() {
  const [modelsData, setModelsData] = useState<Model[]>([]);
  const [mode, setMode] = useState<Mode>('compare');
  const [selected, setSelected] = useState<string[]>([]);
  const [moderator, setModerator] = useState<string>('');
  const [draggedModelId, setDraggedModelId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [showDock, setShowDock] = useState(false);
  const [gridCols, setGridCols] = useState(2); // State for dynamic grid columns
  // Arena vertical offset is visual-only; keep it in refs to avoid full re-renders on scroll.
  const arenaOffsetYRef = useRef(0);
  const arenaTargetYRef = useRef(0);
  const wheelRafRef = useRef<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [githubToken, setGithubToken] = useState<string>(() => {
    try {
      return localStorage.getItem('github_models_token') || '';
    } catch {
      return '';
    }
  });

  // Execution time tracking: { modelId: { startTime, firstTokenTime, endTime } }
  const [executionTimes, setExecutionTimes] = useState<Record<string, ExecutionTimeData>>({});
  const dockRef = useRef<HTMLDivElement>(null); // Ref for the Model Dock

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

  const handleDragStart = (e: React.DragEvent, modelId: string) => {
    setDraggedModelId(modelId);
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
    if (draggedModelId) {
      if (!selected.includes(draggedModelId)) {
        setSelected(prev => [...prev, draggedModelId]);
      }
      setDraggedModelId(null);
    }
  };

  const handleModelToggle = (modelId: string) => {
    if (selected.includes(modelId)) {
      setSelected(prev => prev.filter(id => id !== modelId));
    } else {
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

  useEffect(() => {
    return () => {
      if (flushStreamRafRef.current != null) {
        cancelAnimationFrame(flushStreamRafRef.current);
      }
    };
  }, []);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; modelId: string } | null>(null);

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

  const sendMessage = async (text: string) => {
    if (!text.trim() || selected.length === 0 || isGenerating) return;

    const selectionOverride = Array.from(selectedCardIds).filter(id =>
      selected.includes(id) && (mode === 'compare' || id !== moderator)
    );
    const sessionModelIds = selectionOverride.length > 0 ? selectionOverride : selected.slice();
    sessionModelIdsRef.current = sessionModelIds;

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

    // Initialize execution time tracking for all relevant models
    const startTime = performance.now();
    const initialTimes: Record<string, ExecutionTimeData> = {};
    sessionModelIds.forEach(modelId => {
      initialTimes[modelId] = { startTime };
    });
    if (moderator && !initialTimes[moderator]) {
      initialTimes[moderator] = { startTime };
    }
    setExecutionTimes(prev => ({ ...prev, ...initialTimes }));

    // Reset thinking state for streaming
    const thinkingResetIds = new Set(sessionModelIds);
    if (moderator) thinkingResetIds.add(moderator);
    thinkingResetIds.forEach(modelId => {
      thinkingStateRef.current[modelId] = { inThink: false, carry: '' };
    });

    // Track which models have received their first token
    const firstTokenReceived = new Set<string>();

    // Reset responses for models participating in this run (and chairman/orchestrator)
    setModelsData(prev => prev.map(m =>
      sessionModelIds.includes(m.id) || m.id === moderator
        ? { ...m, response: '', thinking: '' }
        : m
    ));

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

      if (thinkingAdd || answerAdd) {
        enqueueStreamDelta(modelId, answerAdd, thinkingAdd);
      }
    };

    try {
      if (mode === 'compare') {
        setSpeaking(new Set(sessionModelIds));

        const response = await fetchChatStream({
          models: sessionModelIds,
          messages: [{ role: 'user', content: text }],
          max_tokens: GENERATION_DEFAULTS.maxTokens,
          temperature: GENERATION_DEFAULTS.temperature,
          github_token: githubToken || null
        });

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

        const response = await fetchCouncilStream({
          query: text,
          participants,
          chairman_model: moderator || null,
          max_tokens: GENERATION_DEFAULTS.maxTokens,
          github_token: githubToken || null,
        });

        await streamSseEvents(response, (data) => {
          const eventType = data.event;

          if (eventType === 'stage1_start') {
            setPhaseLabel('Stage 1 · Responses');
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

            if ((data as any).response) {
              const finalResponse = String((data as any).response ?? '');
              clearPendingStreamForModel(modelId);
              setModelsData(prev => prev.map(m => m.id === modelId ? { ...m, response: finalResponse } : m));
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
            setModelsData(prev => prev.map(m => m.id === modelId ? { ...m, response: errorText } : m));
            markModelFailed(modelId);
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
            markModelFailed(modelId);
            const errorText = String((data as any).error ?? 'Ranking error.');
            setModelsData(prev => prev.map(m => m.id === modelId ? { ...m, response: errorText } : m));
          }

          if (eventType === 'stage2_complete') {
            const aggregate = (data as any).aggregate_rankings as any[] | undefined;
            if (aggregate) setCouncilAggregateRankings(aggregate as any);
          }

          if (eventType === 'stage3_start') {
            setPhaseLabel('Stage 3 · Synthesis');
            setIsSynthesizing(true);
            if (moderator) setSpeaking(new Set([moderator]));
          }

          if (eventType === 'stage3_complete') {
            const synthesis = String((data as any).response ?? '');
            setModeratorSynthesis(synthesis);
            if (moderator) {
              clearPendingStreamForModel(moderator);
              setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: synthesis } : m));
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

      const response = await fetchDiscussionStream({
        query: text,
        orchestrator_model: moderator || null,
        participants,
        turns: 2,
        max_tokens: GENERATION_DEFAULTS.maxTokens,
        temperature: GENERATION_DEFAULTS.temperature,
        github_token: githubToken || null,
      });

      await streamSseEvents(response, (data) => {
        const eventType = data.event;

        if (eventType === 'analysis_start') {
          setPhaseLabel('Analysis');
        }

        if (eventType === 'analysis_complete') {
          setPhaseLabel('Discussion');
        }

        if (eventType === 'turn_start' && data.model_id) {
          const modelId = data.model_id as string;
          const turnNumber = Number((data as any).turn_number ?? 0);
          currentDiscussionTurnRef.current = { modelId, turnNumber };
          setSpeaking(new Set([modelId]));
          setPhaseLabel(`Turn ${turnNumber + 1}`);

          thinkingStateRef.current[modelId] = { inThink: false, carry: '' };

          setModelsData(prev => prev.map(m => {
            if (m.id !== modelId) return m;
            const needsSep = m.response.trim().length > 0;
            const sep = needsSep ? `\n\n--- Turn ${turnNumber + 1} ---\n\n` : '';
            return { ...m, response: m.response + sep };
          }));
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
          applyThinkingChunk(modelId, String((data as any).chunk ?? ''));
        }

        if (eventType === 'turn_complete' && (data as any).turn) {
          const turn = (data as any).turn as any;
          const modelId = String(turn.model_id ?? data.model_id ?? '');
          const now = performance.now();
          if (modelId) {
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now }
            }));
            setDiscussionTurnsByModel(prev => {
              const existing = prev[modelId] ? [...prev[modelId]] : [];
              existing.push({
                turn_number: Number(turn.turn_number ?? 0),
                response: String(turn.response ?? ''),
                evaluation: (data as any).evaluation ?? undefined,
              });
              return { ...prev, [modelId]: existing };
            });
          }
          setSpeaking(new Set());
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
        }

        if (eventType === 'synthesis_start') {
          setPhaseLabel('Synthesis');
          setIsSynthesizing(true);
          if (moderator) setSpeaking(new Set([moderator]));
        }

        if (eventType === 'discussion_complete') {
          const synthesis = String((data as any).final_response ?? '');
          setModeratorSynthesis(synthesis);
          if (moderator) {
            clearPendingStreamForModel(moderator);
            setModelsData(prev => prev.map(m => m.id === moderator ? { ...m, response: synthesis } : m));
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

    } catch (err) {
      console.error('Chat error:', err);
      pendingStreamRef.current = {};
      if (flushStreamRafRef.current != null) {
        cancelAnimationFrame(flushStreamRafRef.current);
        flushStreamRafRef.current = null;
      }
      setModelsData(prev => prev.map(m =>
        sessionModelIds.includes(m.id) && !m.response ? { ...m, response: 'Error generating response.' } : m
      ));
      sessionModelIds.forEach(id => markModelFailed(id));
    } finally {
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

  const selectedModels = modelsData.filter(m =>
    selected.includes(m.id) && (mode === 'compare' || m.id !== moderator)
  );
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

  // Dynamic layout radius calculation
  const layoutRadius = mode === 'compare' ? 0 : Math.max(LAYOUT.baseRadius, LAYOUT.minRadius + selectedModels.length * LAYOUT.radiusPerModel);

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
          paddingLeft: '1.5rem', // Static padding, sidebar will overlay
          paddingRight: activeInspectorId && mode === 'compare' ? '28rem' : '1.5rem',
          paddingTop: '4rem', // Reverted to 4rem
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
          handleDragStart={handleDragStart}
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
            const effectiveColor = hasError ? errorColor : model.color; // Use red for errors
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
                  ? `1px solid ${model.color}d0`
                  : '1px solid rgba(71, 85, 105, 0.5)';
            const cardShadow = hasError
              ? `0 0 24px ${errorColor}33, inset 0 1px 1px rgba(255,255,255,0.1)`
              : isProcessing
                ? `0 0 24px ${processingColor}33, inset 0 1px 1px rgba(255,255,255,0.1)`
                : isSelected
                  ? `0 0 20px ${model.color}30, inset 0 1px 1px rgba(255,255,255,0.1)`
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

            return (
              <div
                key={model.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(model.id, el);
                  else cardRefs.current.delete(model.id);
                }}
                className="absolute transition-all duration-700 ease-out"
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
                  transform: mode === 'compare'
                    ? `translate(calc(-50% + ${pos.x}px), ${pos.y}px)`
                    : `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                  zIndex: isHovered ? 100 : isSelected ? 20 : isSpeaking ? 10 : 1,
                  left: '50%',
                  top: mode === 'compare' ? '0' : '50%',
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
                  className={`relative cursor-pointer card-hover ${isSelected ? 'card-selected' : ''} ${isSpeaking ? 'card-speaking' : ''}`}
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
                          <Typewriter text={model.response} speed={20} />
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
                        {(isSpeaking || isDone || hasError) && (
                          <div className="flex items-center justify-center mt-3">
                            <StatusIndicator state={statusState} color={effectiveColor} size={14} />
                          </div>
                        )}
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
                      zIndex: 200
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: effectiveColor }} />
                      <span className="text-xs font-semibold text-slate-300">{model.name}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {isSpeaking ? (
                        <Typewriter text={model.response} speed={20} />
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
              <div className="relative w-32 h-32 flex items-center justify-center">
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
                  className="relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300"
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

                  <div className="relative text-center z-10">
                    <div className="text-sm font-semibold text-slate-200">
                      {moderatorModel.name}
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1" style={{ top: 'calc(100% + 12px)' }}>
                <StatusIndicator
                  state={orchestratorStatus}
                  color={moderatorModel.color}
                  size={18}
                  label={orchestratorPhaseLabel}
                />
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
                      <span className="text-slate-500 italic">Waiting for model responses...</span>
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
        />
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        token={githubToken}
        setToken={setGithubToken}
      />

      <PromptInput
        inputRef={inputRef}
        inputFocused={inputFocused}
        setInputFocused={setInputFocused}
        onSendMessage={sendMessage}
      />

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-[200] min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2"
            onClick={() => {
              setModerator(contextMenu.modelId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            {'Set as Orchestrator'}
          </button>
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
