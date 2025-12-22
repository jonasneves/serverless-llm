/**
 * Streaming utilities for all modes
 * Uses backend proxy endpoints - works for both web and extension
 */

// Detect if running in extension context and get API base URL
function getApiBase(): string {
  // In extension mode, use configured backend
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    // This will be set from extension config - default to hosted backend
    return (window as any).__API_BASE__ || 'https://chat.neevs.io';
  }
  // In web mode, use relative URLs (same origin)
  return '';
}

export type ChatStreamEvent = {
  event: string;
  model_id?: string;
  model?: string;
  content?: string;
  [key: string]: unknown;
};

export interface ChatStreamPayload {
  models: string[];
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
  github_token?: string | null;
}

async function* streamFromBackend(
  endpoint: string,
  payload: any,
  signal?: AbortSignal
): AsyncGenerator<ChatStreamEvent> {
  const apiBase = getApiBase();
  const url = `${apiBase}${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    yield { event: 'error', error: `HTTP ${response.status}: ${response.statusText}` };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { event: 'error', error: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr) {
            try {
              const data = JSON.parse(jsonStr);
              yield data;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const fetchChatStream = async (
  payload: ChatStreamPayload,
  signal?: AbortSignal
): Promise<AsyncGenerator<ChatStreamEvent>> => {
  return streamFromBackend('/api/chat/stream', {
    models: payload.models,
    messages: payload.messages,
    max_tokens: payload.max_tokens,
    temperature: payload.temperature,
    github_token: payload.github_token,
  }, signal);
};

export interface CouncilStreamPayload {
  query: string;
  participants: string[];
  chairman_model?: string | null;
  max_tokens: number;
  github_token?: string | null;
  completed_responses?: Record<string, string> | null;
}

export const fetchCouncilStream = async (
  payload: CouncilStreamPayload,
  signal?: AbortSignal
): Promise<AsyncGenerator<ChatStreamEvent>> => {
  return streamFromBackend('/api/chat/council/stream', payload, signal);
};

export interface DiscussionStreamPayload {
  query: string;
  orchestrator_model?: string | null;
  participants?: string[] | null;
  turns?: number;
  max_tokens: number;
  temperature: number;
  github_token?: string | null;
}

export const fetchDiscussionStream = async (
  payload: DiscussionStreamPayload,
  signal?: AbortSignal
): Promise<AsyncGenerator<ChatStreamEvent>> => {
  return streamFromBackend('/api/chat/discussion/stream', payload, signal);
};

export interface PersonalityStreamPayload {
  query: string;
  participants: string[];
  max_tokens: number;
  github_token?: string | null;
}

export const fetchPersonalityStream = async (
  payload: PersonalityStreamPayload,
  signal?: AbortSignal
): Promise<AsyncGenerator<ChatStreamEvent>> => {
  return streamFromBackend('/api/chat/personality/stream', payload, signal);
};

export const streamSseEvents = async (
  eventStream: AsyncGenerator<ChatStreamEvent>,
  onEvent: (data: ChatStreamEvent) => void,
): Promise<void> => {
  try {
    for await (const event of eventStream) {
      // Don't catch errors from onEvent - let them propagate to the caller
      // This is critical for error handling (e.g., rate limit detection triggering fallback)
      onEvent(event);
    }
  } catch (e) {
    console.error('Stream error:', e);
    throw e;
  }
};

// Configure API base for extension mode
export function setApiBase(url: string) {
  (window as any).__API_BASE__ = url;
}
