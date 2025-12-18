/**
 * Unified API client for inference servers and GitHub Models API
 * Replaces Python ModelClient - calls endpoints directly from browser
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      role?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GenerationParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface EndpointConfig {
  qwen?: string;
  phi?: string;
  llama?: string;
  mistral?: string;
  gemma?: string;
  r1qwen?: string;
  rnj?: string;
  githubModels: string;
}

const DEFAULT_ENDPOINTS: EndpointConfig = {
  qwen: 'http://localhost:8001',
  phi: 'http://localhost:8002',
  llama: 'http://localhost:8003',
  mistral: 'http://localhost:8005',
  gemma: 'http://localhost:8006',
  r1qwen: 'http://localhost:8004',
  rnj: 'http://localhost:8007',
  githubModels: 'https://models.github.ai/inference/chat/completions',
};

export class APIClient {
  private endpoints: EndpointConfig;
  private githubToken: string | null = null;

  constructor(endpoints?: Partial<EndpointConfig>) {
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...endpoints };
  }

  setGitHubToken(token: string | null) {
    this.githubToken = token;
  }

  setEndpoint(modelKey: keyof EndpointConfig, url: string) {
    this.endpoints[modelKey] = url;
  }

  /**
   * Map a full model ID (e.g., 'qwen3-4b', 'phi-3-mini') to its service endpoint key
   */
  private getEndpointKey(modelId: string): keyof EndpointConfig | null {
    const normalized = modelId.toLowerCase();

    // Map model ID prefixes to endpoint keys
    const modelToEndpointMap: Array<[string[], keyof EndpointConfig]> = [
      [['qwen3', 'qwen2', 'qwen'], 'qwen'],
      [['phi-3', 'phi-4', 'phi'], 'phi'],
      [['llama-3', 'llama-4', 'llama'], 'llama'],
      [['mistral-7b', 'mistral'], 'mistral'],
      [['gemma-2', 'gemma'], 'gemma'],
      [['deepseek-r1', 'r1qwen', 'r1-qwen'], 'r1qwen'],
      [['rnj-1', 'rnj'], 'rnj'],
    ];

    for (const [patterns, endpointKey] of modelToEndpointMap) {
      if (patterns.some(pattern => normalized.startsWith(pattern) || normalized.includes(pattern))) {
        return endpointKey;
      }
    }

    return null;
  }

  getEndpoint(modelId: string): string | null {
    // First, try to map to a local service endpoint
    const endpointKey = this.getEndpointKey(modelId);
    if (endpointKey && this.endpoints[endpointKey]) {
      return this.endpoints[endpointKey]!;
    }

    // API models use GitHub Models API
    if (this.isApiModel(modelId)) {
      return this.endpoints.githubModels;
    }

    return null;
  }

  isApiModel(modelId: string): boolean {
    // First check if it's a known local model
    const endpointKey = this.getEndpointKey(modelId);
    if (endpointKey && this.endpoints[endpointKey]) {
      return false; // It's a local model
    }

    // API model patterns (from cloud providers)
    const apiModelPatterns = [
      'gpt-', 'claude-', 'command-', 'gemini-',
    ];

    // Special case: Check full model ID for API models
    // These patterns indicate it's an API model, not local
    const apiFullPatterns = [
      'meta/llama-', // GitHub Models hosted Llama
      'mistralai/', // GitHub Models hosted Mistral
      'ai21-labs/',
      'cohere/',
    ];

    const normalized = modelId.toLowerCase();

    if (apiFullPatterns.some(pattern => normalized.includes(pattern))) {
      return true;
    }

    return apiModelPatterns.some(pattern => normalized.includes(pattern));
  }

  async *streamChat(
    modelId: string,
    messages: ChatMessage[],
    params: GenerationParams = {}
  ): AsyncGenerator<StreamChunk> {
    const endpoint = this.getEndpoint(modelId);
    if (!endpoint) {
      throw new Error(`No endpoint configured for model: ${modelId}`);
    }

    const isApi = this.isApiModel(modelId);

    if (isApi && !this.githubToken) {
      throw new Error('GitHub token required for API models');
    }

    // Both local and API models use OpenAI-compatible endpoints
    const url = isApi ? endpoint : `${endpoint}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isApi && this.githubToken) {
      headers['Authorization'] = `Bearer ${this.githubToken}`;
      headers['X-GitHub-Api-Version'] = '2022-11-28';
    }

    const body = {
      model: modelId,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 1024,
      top_p: params.top_p ?? 1.0,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error (${response.status}): ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
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
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              yield data;
            } catch (e) {
              console.warn('Failed to parse SSE data:', trimmed);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async chat(
    modelId: string,
    messages: ChatMessage[],
    params: GenerationParams = {}
  ): Promise<{ content: string; usage?: any }> {
    let fullContent = '';
    let usage = undefined;

    for await (const chunk of this.streamChat(modelId, messages, params)) {
      if (chunk.choices?.[0]?.delta?.content) {
        fullContent += chunk.choices[0].delta.content;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }

    return { content: fullContent, usage };
  }
}

// Singleton instance
export const apiClient = new APIClient();
