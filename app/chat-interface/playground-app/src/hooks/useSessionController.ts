import { Dispatch, SetStateAction } from 'react';
import { GENERATION_DEFAULTS } from '../constants';
import { fetchChatStream, fetchCouncilStream, fetchDiscussionStream, fetchPersonalityStream, streamSseEvents } from '../utils/streaming';
import { ChatHistoryEntry, Mode, Model } from '../types';
import { ExecutionTimeData } from '../components/ExecutionTimeDisplay';

type CouncilRanking = {
  model_id: string;
  model_name: string;
  average_rank: number;
  votes_count: number;
};

type CouncilReview = {
  reviewer_model_id: string;
  reviewer_model_name: string;
  text: string;
  error?: boolean;
};

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
  setCouncilAggregateRankings: Dispatch<SetStateAction<CouncilRanking[] | null>>;
  setCouncilAnonymousReviews: Dispatch<SetStateAction<CouncilReview[]>>;
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
    setCouncilAggregateRankings(null);
    setCouncilAnonymousReviews([]);
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

    const buildRoundtableAnalysisSummary = (analysis: any) => {
      if (!analysis) return '';
      const domainWeights: Record<string, number> = analysis.domain_weights || {};
      const expertise = analysis.model_expertise_scores || {};
      const sortedDomains = Object.entries(domainWeights)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .map(([domain, weight]) => `${formatDomainLabel(domain)} ${formatPercentage(weight)}`)
        .join(', ');

      const participantOrder = sessionModelIds.length > 0
        ? sessionModelIds
        : Object.keys(expertise);
      const participantSummary = participantOrder
        .filter(Boolean)
        .map(id => `${modelIdToName(id)} ${formatPercentage(expertise[id])}`)
        .join(', ');

      const leadName = analysis.discussion_lead
        ? modelIdToName(analysis.discussion_lead)
        : '—';
      const plannedRounds = analysis.expected_turns ?? 2;
      const reasoning = (analysis.reasoning || '').trim();

      const lines = [
        `ORCHESTRATOR • ${moderator ? modelIdToName(moderator) : 'Roundtable'}`,
      ];
      if (sortedDomains) lines.push(`Domains: ${sortedDomains}`);
      lines.push(`Lead: ${leadName}`);
      if (participantSummary) lines.push(`Participants: ${participantSummary}`);
      lines.push(`Planned rounds: ${plannedRounds}`);
      if (reasoning) {
        lines.push('');
        lines.push(reasoning);
      }

      return lines.join('\n').trim();
    };

    const appendEventHistory = (content: string, kind: ChatHistoryEntry['kind']) => {
      const trimmed = content?.trim();
      if (!trimmed || skipHistory) return;
      pushHistoryEntries([{ role: 'assistant', content: trimmed, kind }]);
    };

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

      if (mode === 'council') {
        const participants = sessionModelIds;
        if (participants.length < 2) {
          const msg = 'Select at least 2 participants for Council mode.';
          setModeratorSynthesis(msg);
          if (moderator) {
            setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: msg } : model));
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
        let stage2Expected = 0;
        let stage2Received = 0;

        await streamSseEvents(response, (data) => {
          const eventType = data.event;

          if (eventType === 'stage1_start') {
            setPhaseLabel('Stage 1 · Responses');
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
              appendEventHistory(`${modelIdToName(modelId)}:\n${responseText}`, 'council_turn');
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

          if (eventType === 'stage2_start') {
            const activeParticipants = participants.filter(id => !failedModelsRef.current.has(id));
            stage2Expected = activeParticipants.length;
            stage2Received = 0;
            setCouncilAnonymousReviews([]);
            setPhaseLabel(`Stage 2 · Anonymous Review (0/${stage2Expected})`);
            setModeratorSynthesis(`Anonymous reviews in progress (0/${stage2Expected})…`);
            setSpeaking(new Set(activeParticipants));
          }

          if (eventType === 'ranking_response' && data.model_id) {
            const modelId = data.model_id as string;
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
            stage2Received += 1;
            setPhaseLabel(`Stage 2 · Anonymous Review (${stage2Received}/${stage2Expected || participants.length})`);
            setModeratorSynthesis(`Anonymous reviews in progress (${stage2Received}/${stage2Expected || participants.length})…`);

            const rankingText = String((data as any).ranking ?? '');
            if (rankingText.trim()) {
              const reviewerName = String((data as any).model_name ?? modelId);
              setCouncilAnonymousReviews(prev => [
                ...prev,
                { reviewer_model_id: modelId, reviewer_model_name: reviewerName, text: rankingText.trim() },
              ]);
            }
          }

          if (eventType === 'ranking_error' && data.model_id) {
            const modelId = data.model_id as string;
            setSpeaking(prev => {
              const next = new Set(prev);
              next.delete(modelId);
              return next;
            });
            markModelFailed(modelId);
            stage2Received += 1;
            setPhaseLabel(`Stage 2 · Anonymous Review (${stage2Received}/${stage2Expected || participants.length})`);
            setModeratorSynthesis(`Anonymous reviews in progress (${stage2Received}/${stage2Expected || participants.length})…`);
            const errorText = String((data as any).error ?? 'Ranking error.');
            const reviewerName = String((data as any).model_name ?? modelId);
            setCouncilAnonymousReviews(prev => [
              ...prev,
              { reviewer_model_id: modelId, reviewer_model_name: reviewerName, text: errorText, error: true },
            ]);
          }

          if (eventType === 'stage2_complete') {
            const aggregate = (data as any).aggregate_rankings as CouncilRanking[] | undefined;
            if (aggregate) {
              setCouncilAggregateRankings(aggregate);
              const rankingText = aggregate
                .map((r, i) => `${i + 1}. ${r.model_name} (avg: ${r.average_rank}, votes: ${r.votes_count})`)
                .join('\n');
              appendEventHistory(`Anonymous Rankings:\n${rankingText}`, 'council_ranking');
            }
          }

          if (eventType === 'chairman_quip') {
            const quip = String((data as any).quip ?? '');
            setModeratorSynthesis(quip);
            if (effectiveChairman) {
              appendEventHistory(`${modelIdToName(effectiveChairman)}: ${quip}`, 'council_chairman');
            }
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
              setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: synthesis } : model));
              recordResponse(moderator, synthesis, { replace: true });
            }
            setIsSynthesizing(false);
          }

          if (eventType === 'council_complete') {
            setPhaseLabel(null);
            setIsSynthesizing(false);
            setSpeaking(new Set());
            const aggregate = (data as any).aggregate_rankings as CouncilRanking[] | undefined;
            if (aggregate) setCouncilAggregateRankings(aggregate);
          }

          if (eventType === 'error') {
            const message = String((data as any).error ?? (data as any).message ?? 'Council error.');
            setModeratorSynthesis(message);
            if (moderator) {
              clearPendingStreamForModel(moderator);
              setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: message } : model));
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

      if (mode === 'personality') {
        const participants = sessionModelIds;
        setSpeaking(new Set(participants));

        const response = await fetchPersonalityStream({
          query: contextualQuery,
          participants,
          max_tokens: 512,
          github_token: githubToken || null,
        }, currentController.signal);

        await streamSseEvents(response, (data) => {
          const eventType = data.event;

          if (eventType === 'personality_start') {
            setPhaseLabel('Generating Personas');
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

            // Update persona info as it streams in
            const personaInfo = (data as any).persona_info;
            if (personaInfo) {
              setModelsData(prev => prev.map(model =>
                model.id === modelId
                  ? {
                    ...model,
                    personaEmoji: personaInfo.persona_emoji || model.personaEmoji,
                    personaName: personaInfo.persona_name || model.personaName,
                    personaTrait: personaInfo.persona_trait || model.personaTrait,
                  }
                  : model,
              ));
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
            const personaEmoji = String((data as any).persona_emoji ?? '🎭');
            const personaName = String((data as any).persona_name ?? 'Persona');
            const personaTrait = String((data as any).persona_trait ?? '');

            recordResponse(modelId, responseText, { replace: true });
            setModelsData(prev => prev.map(model =>
              model.id === modelId
                ? {
                  ...model,
                  response: responseText,
                  personaEmoji,
                  personaName,
                  personaTrait,
                }
                : model,
            ));

            // Strip the persona header line from response to avoid duplication
            // The model response starts with "emoji **Name** - trait\n..." but we display that separately
            const lines = responseText.split('\n');
            const firstLine = lines[0] || '';
            const hasPersonaHeader = firstLine.includes('-') && (firstLine.includes('**') || /^[^\w\s]/.test(firstLine));
            const cleanResponse = hasPersonaHeader ? lines.slice(1).join('\n').trim() : responseText;
            
            // Format: "emoji **Name** (ModelName) - trait\n\nresponse"
            const historyEntry = `${personaEmoji} **${personaName}** (${modelIdToName(modelId)})${personaTrait ? ` - ${personaTrait}` : ''}\n\n${cleanResponse}`;
            appendEventHistory(historyEntry, 'personality_response');
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
            const errorText = String((data as any).error ?? 'Error generating persona.');
            clearPendingStreamForModel(modelId);
            setModelsData(prev => prev.map(model =>
              model.id === modelId ? { ...model, response: errorText, error: errorText } : model,
            ));
            markModelFailed(modelId);
          }

          if (eventType === 'personality_complete') {
            setPhaseLabel(null);
            setSpeaking(new Set());
          }

          if (eventType === 'error') {
            const message = String((data as any).error ?? 'Personality mode error.');
            setPhaseLabel('Error');
            setModeratorSynthesis(message);
          }
        });

        return;
      }

      // Roundtable
      const participants = sessionModelIds;
      if (participants.length < 2) {
        const msg = 'Select at least 2 participants for Roundtable mode.';
        setModeratorSynthesis(msg);
        if (moderator) {
          setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: msg } : model));
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
        turns: 2,
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
          let analysisText = 'Analysis complete.';
          if (data.analysis) {
            const analysisObj = data.analysis as any;
            const formatted = buildRoundtableAnalysisSummary(analysisObj);
            if (formatted) {
              analysisText = formatted;
            }
          }
          setModeratorSynthesis(analysisText);
          if (moderator) {
            setModelsData(prev => prev.map(model =>
              model.id === moderator ? { ...model, response: analysisText } : model,
            ));
          }
          appendEventHistory(analysisText, 'roundtable_analysis');
        }

        if (eventType === 'turn_start') {
          const reportedTurn = (data as any).turn_number;
          if (typeof reportedTurn === 'number') {
            currentTurn = reportedTurn;
          }
          setPhaseLabel(`Round ${currentTurn + 1}`);
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
          if (currentDiscussionTurnRef.current?.modelId !== modelId) {
            currentDiscussionTurnRef.current = { modelId, turnNumber: currentTurn };
          }
          applyThinkingChunk(modelId, String(data.chunk ?? ''));
        }

        if (eventType === 'turn_complete' && data.model_id) {
          const modelId = data.model_id as string;
          const now = performance.now();
          setExecutionTimes(prev => ({
            ...prev,
            [modelId]: { ...prev[modelId], endTime: now },
          }));
          const turnResponse = String((data as any).response ?? '');

          setDiscussionTurnsByModel(prev => {
            const existing = prev[modelId] || [];
            return {
              ...prev,
              [modelId]: [...existing, { turn_number: currentTurn, response: turnResponse }],
            };
          });

          setModelsData(prev => prev.map(model => model.id === modelId ? { ...model, response: turnResponse } : model));
          setSpeaking(new Set());
          recordResponse(modelId, turnResponse, { label: `Round ${currentTurn + 1}` });
          recordResponse(modelId, turnResponse, { label: `Round ${currentTurn + 1}` });
          const speakerName = modelIdToName(modelId);
          appendEventHistory(
            `${speakerName} · Round ${currentTurn + 1}\n${turnResponse}`,
            'roundtable_turn',
          );
        }

        if (eventType === 'turn_error' && data.model_id) {
          const modelId = data.model_id as string;
          const now = performance.now();
          setExecutionTimes(prev => ({
            ...prev,
            [modelId]: { ...prev[modelId], endTime: now },
          }));
          const errorText = String((data as any).error ?? 'Error generating response.');
          clearPendingStreamForModel(modelId);
          setModelsData(prev => prev.map(model => model.id === modelId ? { ...model, response: errorText } : model));
          setSpeaking(new Set());
          markModelFailed(modelId);
          recordResponse(modelId, errorText, { replace: true });
          appendEventHistory(
            `${modelIdToName(modelId)} · Round ${currentTurn + 1}\n${errorText}`,
            'roundtable_turn',
          );
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
            setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: synthesis } : model));
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
            setModelsData(prev => prev.map(model => model.id === moderator ? { ...model, response: message } : model));
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
