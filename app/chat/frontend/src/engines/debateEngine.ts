/**
 * Debate Mode - Frontend Orchestration
 * Sequential turn-based discussion between models
 */

import { splitThinkingContent } from '../utils/thinking';

export interface DebateTurn {
  turn_number: number;
  round_number: number;
  model_id: string;
  model_name: string;
  response: string;
  response_time_ms: number;
  timestamp: string;
}

export interface DebateEvent {
  type: 'debate_start' | 'round_start' | 'turn_start' | 'turn_chunk' | 'turn_complete' | 'turn_error' | 'round_complete' | 'debate_complete' | 'error';
  participants?: string[];
  rounds?: number;
  round_number?: number;
  total_rounds?: number;
  turn_number?: number;
  model_id?: string;
  model_name?: string;
  chunk?: string;
  response?: string;
  response_time_ms?: number;
  turns_in_round?: number;
  total_turns?: number;
  participating_models?: string[];
  total_time_ms?: number;
  error?: string;
  error_type?: string;
}

interface DebateParams {
  query: string;
  participants: string[];
  rounds: number;
  maxTokens: number;
  temperature: number;
  systemPrompt: string | null;
  githubToken: string | null;
  signal: AbortSignal;
  modelEndpoints: Record<string, string>;
  modelIdToName: (id: string) => string;
}

function buildTurnPrompt(
  query: string,
  modelId: string,
  previousTurns: DebateTurn[],
  participantIds: string[],
  modelIdToName: (id: string) => string
): string {
  const myName = modelIdToName(modelId);

  const otherNames = participantIds
    .filter(pid => pid !== modelId)
    .map(pid => modelIdToName(pid));
  const othersList = otherNames.length > 0 ? otherNames.join(', ') : 'others';

  if (previousTurns.length === 0) {
    return `You are ${myName}, participating in a discussion with ${othersList}.

User Query:
${query}

Provide your response to the query. Be concise and clear.`;
  } else {
    const previousContext = previousTurns
      .map(turn => `**${turn.model_name}**:\n${turn.response}`)
      .join('\n\n');

    return `You are ${myName}, participating in a discussion with ${othersList}.

Original User Query:
${query}

Discussion so far:
${previousContext}

Now it's your turn. You can:
- Build on previous responses
- Offer a different perspective
- Point out what others missed
- Synthesize the discussion

Provide your response:`;
  }
}

async function* streamModelDirect(
  modelId: string,
  modelUrl: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number,
  githubToken: string | null,
  signal: AbortSignal
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; content?: string; error?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  try {
    const response = await fetch(`${modelUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      yield { type: 'error', error: `HTTP ${response.status}` };
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { type: 'chunk', content };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function* executeTurn(
  query: string,
  modelId: string,
  turnNumber: number,
  roundNumber: number,
  previousTurns: DebateTurn[],
  participantIds: string[],
  maxTokens: number,
  temperature: number,
  systemPrompt: string | null,
  githubToken: string | null,
  signal: AbortSignal,
  modelEndpoints: Record<string, string>,
  modelIdToName: (id: string) => string
): AsyncGenerator<DebateEvent> {
  const modelName = modelIdToName(modelId);
  const modelUrl = modelEndpoints[modelId];

  if (!modelUrl) {
    yield {
      type: 'turn_error',
      model_id: modelId,
      error: 'Model endpoint not configured',
    };
    return;
  }

  const prompt = buildTurnPrompt(query, modelId, previousTurns, participantIds, modelIdToName);

  yield {
    type: 'turn_start',
    turn_number: turnNumber,
    round_number: roundNumber,
    model_id: modelId,
    model_name: modelName,
  };

  let fullResponse = '';
  const startTime = Date.now();

  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({
      role: 'system',
      content: `You are participating in a multi-model debate.

Guidelines for your response:
- Focus on facts and problem-solving with direct, objective information
- Show your reasoning step-by-step, but keep each step concise
- Avoid unnecessary superlatives, praise, or emotional validation
- Do not repeat the question or add meta-commentary
- Get straight to the analysis - no preamble like "Let me think about this"
- When uncertain, acknowledge it and explain why rather than claiming certainty
- Be professional and objective - prioritize technical accuracy over validation

Your task:
- Respond to the question considering previous responses (if any)
- You may build on, challenge, or offer alternatives to earlier points
- Bring new perspectives or evidence to the discussion
- Reference specific points from others when relevant, but stay concise
- No meta-commentary about the debate process itself

Target length: 100-200 words.`
    });
    messages.push({ role: 'user', content: prompt });

    for await (const event of streamModelDirect(modelId, modelUrl, messages, maxTokens, temperature, githubToken, signal)) {
      if (event.type === 'chunk') {
        fullResponse += event.content;
        yield {
          type: 'turn_chunk',
          model_id: modelId,
          chunk: event.content,
        };
      } else if (event.type === 'error') {
        yield {
          type: 'turn_error',
          model_id: modelId,
          error: event.error || 'Unknown error',
        };
        return;
      } else if (event.type === 'done') {
        const responseTimeMs = Date.now() - startTime;
        const { answer } = splitThinkingContent(fullResponse);
        const cleanResponse = answer || fullResponse;

        yield {
          type: 'turn_complete',
          turn_number: turnNumber,
          round_number: roundNumber,
          model_id: modelId,
          model_name: modelName,
          response: cleanResponse,
          response_time_ms: responseTimeMs,
        };
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name !== 'AbortError') {
      yield {
        type: 'turn_error',
        model_id: modelId,
        error: error.message,
      };
    }
  }
}

export async function* runDebate(params: DebateParams): AsyncGenerator<DebateEvent> {
  const {
    query,
    participants,
    rounds,
    maxTokens,
    temperature,
    systemPrompt,
    githubToken,
    signal,
    modelEndpoints,
    modelIdToName,
  } = params;

  try {
    if (!participants.length) {
      yield { type: 'error', error: 'No participants selected' };
      return;
    }

    yield {
      type: 'debate_start',
      participants,
      rounds,
    };

    const completedTurns: DebateTurn[] = [];
    let turnCounter = 0;

    for (let roundNum = 0; roundNum < rounds; roundNum++) {
      yield {
        type: 'round_start',
        round_number: roundNum,
        total_rounds: rounds,
      };

      for (const modelId of participants) {
        for await (const event of executeTurn(
          query,
          modelId,
          turnCounter,
          roundNum,
          completedTurns,
          participants,
          maxTokens,
          temperature,
          systemPrompt,
          githubToken,
          signal,
          modelEndpoints,
          modelIdToName
        )) {
          yield event;

          if (event.type === 'turn_complete') {
            completedTurns.push({
              turn_number: turnCounter,
              round_number: roundNum,
              model_id: event.model_id!,
              model_name: event.model_name!,
              response: event.response!,
              response_time_ms: event.response_time_ms!,
              timestamp: new Date().toISOString(),
            });
            turnCounter++;
          }
        }
      }

      yield {
        type: 'round_complete',
        round_number: roundNum,
        turns_in_round: participants.length,
      };
    }

    yield {
      type: 'debate_complete',
      total_turns: completedTurns.length,
      total_rounds: rounds,
      participating_models: participants,
      total_time_ms: completedTurns.reduce((sum, t) => sum + t.response_time_ms, 0),
    };
  } catch (error: unknown) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
    };
  }
}
