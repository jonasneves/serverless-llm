/**
 * Direct API streaming without backend dependency
 * Replaces utils/streaming.ts fetch calls to /api/*
 */

import { apiClient, ChatMessage } from './apiClient';
import { GitHubModelsOrchestrator } from '../engines/orchestrator';
import { DiscussionEngine } from '../engines/discussionEngine';

// Import model profiles (simplified version for now)
const MODEL_PROFILES: Record<string, any> = {
  'qwen': { name: 'Qwen', strengths: ['coding', 'mathematics', 'reasoning'] },
  'phi': { name: 'Phi', strengths: ['reasoning', 'conversation'] },
  'llama': { name: 'Llama', strengths: ['conversation', 'creative_writing'] },
  'mistral': { name: 'Mistral', strengths: ['coding', 'reasoning'] },
  'gemma': { name: 'Gemma', strengths: ['conversation', 'common_sense'] },
  'r1qwen': { name: 'R1 Qwen', strengths: ['reasoning', 'mathematics'] },
  'rnj': { name: 'RNJ', strengths: ['conversation'] },
  // Add API models
  'gpt-4o': { name: 'GPT-4o', strengths: ['reasoning', 'coding', 'conversation'] },
  'gpt-4.1': { name: 'GPT-4.1', strengths: ['reasoning', 'mathematics'] },
  'deepseek-v3-0324': { name: 'DeepSeek V3', strengths: ['coding', 'mathematics'] },
};

/**
 * Stream a simple chat completion (Single/Compare/Arena modes)
 */
export async function* streamSingleChat(
  modelId: string,
  messages: ChatMessage[],
  params: {
    temperature?: number;
    max_tokens?: number;
  } = {}
): AsyncGenerator<any> {
  yield {
    event: 'start',
    model_id: modelId
  };

  try {
    for await (const chunk of apiClient.streamChat(modelId, messages, {
      ...params,
      stream: true
    })) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield {
          event: 'token',
          model_id: modelId,
          content: content
        };
      }
      if (chunk.usage) {
        yield {
          event: 'usage',
          model_id: modelId,
          usage: chunk.usage
        };
      }
      if (chunk.choices?.[0]?.finish_reason) {
        yield {
          event: 'done',
          model_id: modelId
        };
      }
    }

    yield {
      event: 'complete',
      model_id: modelId
    };
  } catch (error: any) {
    yield {
      event: 'error',
      model_id: modelId,
      error: error.message || 'Stream failed'
    };
  }
}

/**
 * Stream a discussion/roundtable session
 */
export async function* streamDiscussion(
  query: string,
  githubToken: string | null,
  params: {
    temperature?: number;
    max_tokens?: number;
    turns?: number;
    participants?: string[];
  } = {}
): AsyncGenerator<any> {
  if (!githubToken) {
    yield {
      event: 'error',
      error: 'GitHub token required for Discussion mode. Please add your token in Settings.'
    };
    return;
  }

  // Initialize engines
  apiClient.setGitHubToken(githubToken);
  const orchestrator = new GitHubModelsOrchestrator(apiClient);
  const discussionEngine = new DiscussionEngine(apiClient, orchestrator, MODEL_PROFILES);

  try {
    for await (const event of discussionEngine.runDiscussion(query, params)) {
      // Convert discussion events to frontend format
      if (event.type === 'analysis_complete') {
        yield {
          event: 'analysis_complete',
          analysis: event.analysis
        };
      } else if (event.type === 'turn_start') {
        yield {
          event: 'turn_start',
          model_id: event.model_id,
          turn_number: event.data?.turn_number
        };
      } else if (event.type === 'turn_chunk') {
        yield {
          event: 'turn_chunk',
          model_id: event.model_id,
          chunk: event.chunk
        };
      } else if (event.type === 'turn_complete') {
        yield {
          event: 'turn_complete',
          turn: event.turn,
          evaluation: event.evaluation
        };
      } else if (event.type === 'synthesis_complete') {
        yield {
          event: 'synthesis_complete',
          synthesis: event.synthesis
        };
      } else if (event.type === 'discussion_complete') {
        yield {
          event: 'discussion_complete',
          data: event.data
        };
      } else if (event.type === 'error') {
        yield {
          event: 'error',
          error: event.error
        };
      }
    }
  } catch (error: any) {
    yield {
      event: 'error',
      error: error.message || 'Discussion failed'
    };
  }
}

/**
 * Configure API client with user settings
 */
export function configureApiClient(config: {
  githubToken?: string | null;
  endpoints?: Record<string, string>;
}) {
  if (config.githubToken !== undefined) {
    apiClient.setGitHubToken(config.githubToken);
  }
  if (config.endpoints) {
    for (const [key, url] of Object.entries(config.endpoints)) {
      apiClient.setEndpoint(key as any, url);
    }
  }
}

/**
 * Get available models (replaces /api/models endpoint)
 */
export async function getAvailableModels(): Promise<any> {
  // Return static model configuration
  // In the future, could ping each endpoint to check availability
  return {
    models: Object.keys(MODEL_PROFILES).map(id => ({
      id,
      name: MODEL_PROFILES[id].name,
      type: apiClient.isApiModel(id) ? 'api' : 'local'
    }))
  };
}
