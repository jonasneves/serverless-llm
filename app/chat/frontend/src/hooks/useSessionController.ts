import { Dispatch, SetStateAction } from 'react';
import { GENERATION_DEFAULTS } from '../constants';
import { fetchChatStream, fetchAnalyzeStream, fetchDebateStream, streamSseEvents } from '../utils/streaming';
import { ChatHistoryEntry, Mode, Model } from '../types';
import { ExecutionTimeData } from '../components/ExecutionTimeDisplay';

type DiscussionTurn = {
  turn_number: number;
  response: string;
  evaluation?: unknown;
};

interface SessionControllerParams {
  mode: Mode;
  moderator: string;
  selected: string[];
  selectedCardIds: Set<string>;
  githubToken: string;
  isGenerating: boolean;
  summarizeSessionResponses: (responses: Record<string, string>, order: string[]) => string | null;
  setLastQuery: (text: string) => void;
  setHoveredCard: (value: string | null) => void;
  setPhaseLabel: Dispatch<SetStateAction<string | null>>;
  setModeratorSynthesis: Dispatch<SetStateAction<string>>;
  setDiscussionTurnsByModel: Dispatch<SetStateAction<Record<string, DiscussionTurn[]>>>;
  resetFailedModels: () => void;
  markModelFailed: (modelId: string) => void;
  failedModelsRef: React.MutableRefObject<Set<string>>;
  currentDiscussionTurnRef: React.MutableRefObject<{ modelId: string; turnNumber: number } | null>;
  sessionModelIdsRef: React.MutableRefObject<string[]>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  thinkingStateRef: React.MutableRefObject<Record<string, { inThink: boolean; carry: string }>>;
  conversationHistoryRef: React.MutableRefObject<ChatHistoryEntry[]>;
  pushHistoryEntries: (entries: ChatHistoryEntry[]) => void;
  historyToText: (history: ChatHistoryEntry[]) => string;
  buildCarryoverHistory: (history: ChatHistoryEntry[], targetMode: Mode) => ChatHistoryEntry[];
  setModelsData: React.Dispatch<React.SetStateAction<Model[]>>;
  modelIdToName: (id: string) => string;
  setExecutionTimes: React.Dispatch<React.SetStateAction<Record<string, ExecutionTimeData>>>;
  setIsGenerating: (value: boolean) => void;
  setIsSynthesizing: (value: boolean) => void;
  setSpeaking: React.Dispatch<React.SetStateAction<Set<string>>>;
  enqueueStreamDelta: (modelId: string, answerAdd: string, thinkingAdd: string) => void;
  clearPendingStreamForModel: (modelId: string) => void;
  resetPendingStream: () => void;
}

interface SendMessageOptions {
  skipHistory?: boolean;
}

export function useSessionController(params: SessionControllerParams) {
  const {
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
  } = params;

  const sendMessage = async (
    text: string,
    previousResponses?: Record<string, string> | null,
    participantsOverride?: string[],
    options?: SendMessageOptions,
  ) => {
    if (!text.trim() || (selected.length === 0 && !participantsOverride)) return;
    if (!participantsOverride && isGenerating) return;

    const skipHistory = options?.skipHistory ?? false;
    const userEntry: ChatHistoryEntry = { role: 'user', content: text };
    const baseHistory = skipHistory
      ? conversationHistoryRef.current
      : [...conversationHistoryRef.current, userEntry];

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
        selected.includes(id) && (mode === 'compare' || id !== moderator),
      );
      sessionModelIds = selectionOverride.length > 0 ? selectionOverride : selected.slice();
    }
    sessionModelIdsRef.current = sessionModelIds;

    const sessionResponses: Record<string, string> = {};
    const recordResponse = (modelId: string, content: string, opts?: { replace?: boolean; label?: string }) => {
      if (!content) return;
      const addition = opts?.label ? `${opts.label}: ${content}` : content;
      sessionResponses[modelId] = opts?.replace
        ? addition
        : (sessionResponses[modelId]
          ? `${sessionResponses[modelId]}\n\n${addition}`
          : addition);
    };

    const currentController = new AbortController();
    abortControllerRef.current = currentController;
    setIsGenerating(true);
    setIsSynthesizing(false);
    setHoveredCard(null);
    setPhaseLabel(null);
    setModeratorSynthesis('');
    setDiscussionTurnsByModel({});
    resetFailedModels();
    currentDiscussionTurnRef.current = null;

    resetPendingStream();

    setModelsData(prev => prev.map(model => {
      if (sessionModelIds.includes(model.id) || model.id === moderator) {
        if (previousResponses && previousResponses[model.id]) {
          return { ...model, response: previousResponses[model.id], thinking: undefined, error: undefined };
        }
        return { ...model, response: '', thinking: undefined, error: undefined };
      }
      return model;
    }));

    setExecutionTimes(prev => {
      const next = { ...prev };
      const startTime = performance.now();
      sessionModelIds.forEach(id => {
        next[id] = { startTime };
      });
      if (moderator && !next[moderator]) {
        next[moderator] = { startTime };
      }
      return next;
    });

    const thinkingResetIds = new Set(sessionModelIds);
    if (moderator) thinkingResetIds.add(moderator);
    thinkingResetIds.forEach(modelId => {
      thinkingStateRef.current[modelId] = { inThink: false, carry: '' };
    });

    const firstTokenReceived = new Set<string>();

    const formatDomainLabel = (value: string) =>
      value
        ? value
          .replace(/_/g, ' ')
          .replace(/\b\w/g, char => char.toUpperCase())
        : '';

    const formatPercentage = (value?: number) =>
      typeof value === 'number' && Number.isFinite(value)
        ? `${Math.round(value * 100)}%`
        : '—';

    const appendEventHistory = (content: string, kind: ChatHistoryEntry['kind']) => {
      const trimmed = content?.trim();
      if (!trimmed || skipHistory) return;
      pushHistoryEntries([{ role: 'assistant', content: trimmed, kind }]);
    };

    const applyThinkingChunk = (modelId: string, rawChunk: string) => {
      const state = thinkingStateRef.current[modelId] || { inThink: false, carry: '' };
      let textChunk = state.carry + rawChunk;
      state.carry = '';

      // Check for partial tags at the end (handle both <think> and <thinking>)
      const lastLt = textChunk.lastIndexOf('<');
      if (lastLt !== -1 && textChunk.length - lastLt < 12) {
        const tail = textChunk.slice(lastLt);
        if (
          '<think>'.startsWith(tail) || '</think>'.startsWith(tail) ||
          '<thinking>'.startsWith(tail) || '</thinking>'.startsWith(tail)
        ) {
          state.carry = tail;
          textChunk = textChunk.slice(0, lastLt);
        }
      }

      let thinkingAdd = '';
      let answerAdd = '';
      let idx = 0;
      while (idx < textChunk.length) {
        if (!state.inThink) {
          // Look for either <think> or <thinking>
          const startThink = textChunk.indexOf('<think>', idx);
          const startThinking = textChunk.indexOf('<thinking>', idx);

          let start = -1;
          let tagLen = 0;
          if (startThink !== -1 && (startThinking === -1 || startThink < startThinking)) {
            start = startThink;
            tagLen = 7; // '<think>'.length
          } else if (startThinking !== -1) {
            start = startThinking;
            tagLen = 10; // '<thinking>'.length
          }

          if (start === -1) {
            answerAdd += textChunk.slice(idx);
            break;
          }
          answerAdd += textChunk.slice(idx, start);
          state.inThink = true;
          idx = start + tagLen;
        } else {
          // Look for either </think> or </thinking>
          const endThink = textChunk.indexOf('</think>', idx);
          const endThinking = textChunk.indexOf('</thinking>', idx);

          let end = -1;
          let tagLen = 0;
          if (endThink !== -1 && (endThinking === -1 || endThink < endThinking)) {
            end = endThink;
            tagLen = 8; // '</think>'.length
          } else if (endThinking !== -1) {
            end = endThinking;
            tagLen = 11; // '</thinking>'.length
          }

          if (end === -1) {
            thinkingAdd += textChunk.slice(idx);
            break;
          }
          thinkingAdd += textChunk.slice(idx, end);
          state.inThink = false;
          idx = end + tagLen;
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


    const addIconToMessage = (message: string): string => {
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('rate limit') || lowerMsg.includes('waiting')) {
        const clockIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; vertical-align: text-bottom; margin-right: 6px;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        return clockIcon + message;
      }

      if (lowerMsg.includes('error') || lowerMsg.includes('failed')) {
        const warningIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; vertical-align: text-bottom; margin-right: 6px;"><path d="M12 2L2 20h20L12 2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        return warningIcon + message;
      }

      return message;
    };

    try {
      if (mode === 'compare') {
        setSpeaking(new Set(sessionModelIds));

        const response = await fetchChatStream({
          models: sessionModelIds,
          messages: baseHistory.map(msg => ({ role: msg.role, content: msg.content })),
          max_tokens: GENERATION_DEFAULTS.maxTokens,
          temperature: GENERATION_DEFAULTS.temperature,
          github_token: githubToken || null,
        }, currentController.signal);

        await streamSseEvents(response, (data) => {
          if (data.event === 'info' && data.content) {
            const rawMessage = String(data.content);
            const messageWithIcon = addIconToMessage(rawMessage);
            setPhaseLabel(messageWithIcon);
            if (data.model_id) {
              setModelsData(prev => prev.map(model =>
                model.id === data.model_id
                  ? { ...model, statusMessage: messageWithIcon }
                  : model,
              ));
            }
          }

          if (data.event === 'token' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();

            if (!firstTokenReceived.has(modelId)) {
              firstTokenReceived.add(modelId);
              setExecutionTimes(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], firstTokenTime: now },
              }));
              setModelsData(prev => prev.map(model =>
                model.id === modelId ? { ...model, statusMessage: undefined } : model,
              ));
            }

            applyThinkingChunk(modelId, String(data.content ?? ''));
          }

          if (data.event === 'done' && data.model_id) {
            const now = performance.now();
            const modelId = data.model_id as string;
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now },
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

      if (mode === 'analyze') {
        const participants = sessionModelIds;
        if (participants.length < 2) {
          const msg = 'Select at least 2 participants for Analyze mode.';
          setModeratorSynthesis(msg);
          if (moderator) {
            setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: msg } : model));
          }
          setPhaseLabel('Error');
          return;
        }
        setSpeaking(new Set(participants));

        const response = await fetchAnalyzeStream({
          query: contextualQuery,
          participants,
          max_tokens: GENERATION_DEFAULTS.maxTokens,
          github_token: githubToken || null,
        }, currentController.signal);

        let analyzeSynthesis = '';

        await streamSseEvents(response, (data) => {
          const eventType = data.event;

          if (eventType === 'analyze_start') {
            setPhaseLabel('Collecting Responses');
          }

          if (eventType === 'model_start' && data.model_id) {
            const modelId = data.model_id as string;
            setSpeaking(prev => {
              const next = new Set(prev);
              next.add(modelId);
              return next;
            });
          }

          if (eventType === 'model_chunk' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            if (!firstTokenReceived.has(modelId)) {
              firstTokenReceived.add(modelId);
              setExecutionTimes(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], firstTokenTime: now },
              }));
            }
            applyThinkingChunk(modelId, String((data as any).chunk ?? ''));
          }

          if (eventType === 'model_response' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now },
            }));
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });

            const responseText = String((data as any).response ?? '');
            recordResponse(modelId, responseText, { replace: true });
            if (!(previousResponses && previousResponses[modelId])) {
              setModelsData(prev => prev.map(model => model.id === modelId ? { ...model, response: responseText } : model));
              appendEventHistory(`${modelIdToName(modelId)}:\n${responseText}`, 'analyze_response');
            }
          }

          if (eventType === 'model_error' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now },
            }));
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
            const errorText = String((data as any).error ?? 'Error generating response.');
            clearPendingStreamForModel(modelId);
            setModelsData(prev => prev.map(model => model.id === modelId ? { ...model, response: errorText, error: errorText } : model));
            markModelFailed(modelId);
            recordResponse(modelId, errorText, { replace: true });
          }

          if (eventType === 'analysis_complete') {
            setPhaseLabel('Analysis Complete');
            const consensus = (data as any).consensus || [];
            const unique = (data as any).unique_contributions || {};

            let analysis = 'Analysis:\n\n';
            if (consensus.length > 0) {
              analysis += 'Consensus:\n' + consensus.map((c: string) => `• ${c}`).join('\n') + '\n\n';
            }
            if (Object.keys(unique).length > 0) {
              analysis += 'Unique Contributions:\n';
              for (const [modelId, points] of Object.entries(unique)) {
                const modelName = modelIdToName(modelId);
                analysis += `\n${modelName}:\n` + (points as string[]).map((p: string) => `• ${p}`).join('\n') + '\n';
              }
            }
            analyzeSynthesis = analysis;
            setModeratorSynthesis(analysis);
            if (moderator) {
              setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: analysis } : model));
            }
          }

          if (eventType === 'analyze_complete') {
            setPhaseLabel('Complete');
            setSpeaking(new Set());
          }

          if (eventType === 'error') {
            const message = String((data as any).error ?? 'Analyze error.');
            setModeratorSynthesis(message);
            setPhaseLabel('Error');
          }
        });

        if (!skipHistory) {
          const trimmed = analyzeSynthesis.trim();
          if (trimmed) {
            pushHistoryEntries([{ role: 'assistant', content: trimmed, kind: 'analyze_synthesis' }]);
          }
        }
        return;
      }

      if (mode === 'debate') {
        const participants = sessionModelIds;
        if (participants.length < 2) {
          const msg = 'Select at least 2 participants for Debate mode.';
          setModeratorSynthesis(msg);
          if (moderator) {
            setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: msg } : model));
          }
          setPhaseLabel('Error');
          return;
        }

        const response = await fetchDebateStream({
          query: contextualQuery,
          participants,
          turns: 2,
          max_tokens: GENERATION_DEFAULTS.maxTokens,
          temperature: GENERATION_DEFAULTS.temperature,
          github_token: githubToken || null,
        }, currentController.signal);

        await streamSseEvents(response, (data) => {
          const eventType = data.event;

          if (eventType === 'debate_start') {
            setPhaseLabel('Debate Starting');
          }

          if (eventType === 'round_start') {
            const roundNum = (data as any).round_number ?? 0;
            setPhaseLabel(`Round ${roundNum + 1}`);
          }

          if (eventType === 'turn_start' && data.model_id) {
            const modelId = data.model_id as string;
            const turnNum = (data as any).turn_number ?? 0;
            const roundNum = (data as any).round_number ?? 0;
            setSpeaking(new Set([modelId]));
            setPhaseLabel(`Round ${roundNum + 1} · Turn ${turnNum + 1}`);
            currentDiscussionTurnRef.current = { modelId, turnNumber: turnNum };
          }

          if (eventType === 'turn_chunk' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            if (!firstTokenReceived.has(modelId)) {
              firstTokenReceived.add(modelId);
              setExecutionTimes(prev => ({
                ...prev,
                [modelId]: { ...prev[modelId], firstTokenTime: now },
              }));
            }
            applyThinkingChunk(modelId, String((data as any).chunk ?? ''));
          }

          if (eventType === 'turn_complete' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now },
            }));
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });

            const responseText = String((data as any).response ?? '');
            const turnNum = (data as any).turn_number ?? 0;
            recordResponse(modelId, responseText, { replace: true });
            setModelsData(prev => prev.map(model =>
              model.id === modelId ? { ...model, response: responseText } : model
            ));

            setDiscussionTurnsByModel(prev => ({
              ...prev,
              [modelId]: [...(prev[modelId] || []), { turn_number: turnNum, response: responseText }],
            }));

            appendEventHistory(`${modelIdToName(modelId)}:\n${responseText}`, 'debate_turn');
          }

          if (eventType === 'turn_error' && data.model_id) {
            const modelId = data.model_id as string;
            const now = performance.now();
            setExecutionTimes(prev => ({
              ...prev,
              [modelId]: { ...prev[modelId], endTime: now },
            }));
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
            const errorText = String((data as any).error ?? 'Turn error.');
            clearPendingStreamForModel(modelId);
            setModelsData(prev => prev.map(model =>
              model.id === modelId ? { ...model, response: errorText, error: errorText } : model
            ));
            markModelFailed(modelId);
          }

          if (eventType === 'debate_complete') {
            setPhaseLabel('Complete');
            setSpeaking(new Set());
          }

          if (eventType === 'error') {
            const message = String((data as any).error ?? 'Debate error.');
            setPhaseLabel('Error');
            setModeratorSynthesis(message);
          }
        });

        return;
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error('Chat error:', err);
      if (abortControllerRef.current === currentController) {
        const errorMsg = (err as Error).message || String(err);
        setModeratorSynthesis(`Session Error: ${errorMsg}`);
        setPhaseLabel('Error');
        resetPendingStream();
        setModelsData(prev => prev.map(model =>
          sessionModelIds.includes(model.id) && !model.response
            ? { ...model, response: 'Error generating response.' }
            : model,
        ));
        sessionModelIds.forEach(id => markModelFailed(id));
      }
    } finally {
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

  return { sendMessage };
}
