export type ChatStreamEvent = {
  event: string;
  model_id?: string;
  content?: string;
  [key: string]: unknown;
};

export interface ChatStreamPayload {
  models: string[];
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
}

export const fetchChatStream = async (payload: ChatStreamPayload): Promise<Response> => {
  return fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export const streamSseEvents = async (
  response: Response,
  onEvent: (data: ChatStreamEvent) => void,
): Promise<void> => {
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6);
      if (jsonStr === '[DONE]') continue;

      try {
        const data = JSON.parse(jsonStr) as ChatStreamEvent;
        try {
          onEvent(data);
        } catch (e) {
          console.error('Error parsing SSE:', e);
        }
      } catch (e) {
        console.error('Error parsing SSE:', e);
      }
    }
  }
};

