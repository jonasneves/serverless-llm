import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Model } from '../types';
import { MODEL_META } from '../constants';
import { usePersistedSetting } from './usePersistedSetting';
import { config } from '../config';
import { fetchWithTimeout } from '../utils/fetch';

interface ModelsApiModel {
  id: string;
  name?: string;
  type?: string;
  priority?: number;
  context_length?: number;
  default?: boolean;
}

interface ModelsApiResponse {
  models: ModelsApiModel[];
}

// Retry config for initial model loading (handles cold starts)
const INITIAL_RETRY_DELAY = 800;   // Start with 800ms
const MAX_RETRY_DELAY = 3000;      // Cap at 3s
const MAX_RETRIES = 8;             // Give up after ~20s total
const FETCH_TIMEOUT = 8000;        // 8s timeout for each fetch attempt

export function useModelsManager() {
  const [modelsData, setModelsData] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Multi-model selection (for Compare, Analyze, Debate, Personalities)
  const [persistedSelected, setPersistedSelected] = usePersistedSetting<string[] | null>('playground_selected_models', null);
  const isSelectionInitialized = useRef(persistedSelected !== null);

  // Chat mode uses a separate, independent model selection
  const [chatModelId, setChatModelId] = usePersistedSetting<string | null>('playground_chat_model', null);
  const isChatModelInitialized = useRef(chatModelId !== null);

  const selected = useMemo(() => persistedSelected ?? [], [persistedSelected]);

  const setSelected = useCallback((value: string[] | ((prev: string[]) => string[])) => {
    setPersistedSelected(prev => {
      const safePrev = prev ?? [];
      return typeof value === 'function' ? value(safePrev) : value;
    });
  }, [setPersistedSelected]);

  const [moderator, setModerator] = useState<string>('');

  // Ref to track active fetch and prevent race conditions
  const fetchIdRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadModels = useCallback(async (fetchId: number, currentRetry: number, isManualRetry = false): Promise<void> => {
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setIsLoading(true);
    if (isManualRetry) {
      setLoadError('Refreshing...');
      setRetryCount(0);
    }

    // Helper to process models response
    const processModels = (data: ModelsApiResponse) => {
      const apiModels = data.models
        .filter((model) => model.type !== 'external')
        .map((model) => {
          const modelType: 'self-hosted' | 'github' =
            (model.type === 'github' || model.type === 'api') ? 'github' : 'self-hosted';
          const meta = MODEL_META[modelType];
          return {
            id: model.id,
            name: meta.name || model.name || model.id,
            color: meta.color,
            type: modelType,
            response: '',
            priority: model.priority,
            context_length: model.context_length,
            default: model.default,
            available: modelType === 'github' ? true : undefined, // GitHub models are always available, self-hosted will be checked
          };
        });

      setModelsData(apiModels);
      setIsLoading(false);
      setLoadError(null);
      setRetryCount(0);

      if (!isSelectionInitialized.current) {
        setPersistedSelected([]);
        isSelectionInitialized.current = true;
      }

      // Initialize chat model: gpt-4o > default > first github > first available
      if (!isChatModelInitialized.current) {
        const gpt4o = apiModels.find(m => m.id === 'gpt-4o');
        const defaultModel = apiModels.find(m => m.default);
        const firstApiModel = apiModels.find(m => m.type === 'github');
        setChatModelId(gpt4o?.id ?? defaultModel?.id ?? firstApiModel?.id ?? apiModels[0]?.id ?? null);
        isChatModelInitialized.current = true;
      }

      // Set moderator: prefer github model, then default, then first available
      const moderatorId = apiModels.find(m => m.type === 'github')?.id
        ?? apiModels.find(m => m.default)?.id
        ?? apiModels[0]?.id
        ?? '';
      setModerator(moderatorId);
    };

    try {
      const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/models`, undefined, FETCH_TIMEOUT);
      if (fetchId !== fetchIdRef.current) return;

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: ModelsApiResponse = await response.json();
      if (fetchId !== fetchIdRef.current) return;

      if (!data.models?.length) throw new Error('No models available yet');

      processModels(data);

    } catch {
      if (fetchId !== fetchIdRef.current) return;

      // Fallback: try static models.json (for extension mode)
      try {
        const staticResponse = await fetchWithTimeout('/models.json', undefined, FETCH_TIMEOUT);
        if (staticResponse.ok) {
          const staticData = await staticResponse.json();
          if (staticData.models?.length > 0) {
            processModels(staticData);
            return;
          }
        }
      } catch {
        // Static fallback also unavailable
      }

      // Both failed - retry or give up
      const nextRetry = currentRetry + 1;
      setRetryCount(nextRetry);

      if (nextRetry < MAX_RETRIES) {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.4, currentRetry), MAX_RETRY_DELAY);
        setLoadError('Connecting to backend...');
        retryTimeoutRef.current = setTimeout(() => {
          loadModels(fetchId, nextRetry);
        }, delay);
      } else {
        setIsLoading(false);
        setLoadError('Could not load models');
      }
    }
  }, [setPersistedSelected, setChatModelId]);

  // Manual retry function
  const retryNow = useCallback(() => {
    fetchIdRef.current += 1;
    loadModels(fetchIdRef.current, 0, true);
  }, [loadModels]);

  // Initial load on mount
  useEffect(() => {
    fetchIdRef.current += 1;
    loadModels(fetchIdRef.current, 0);

    return () => {
      // Invalidate any in-flight fetches
      fetchIdRef.current += 1;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [loadModels]);

  const availableModels = useMemo(
    () => modelsData.filter(m =>
      !selected.includes(m.id) &&
      (m.type !== 'self-hosted' || m.available !== false)
    ),
    [modelsData, selected],
  );

  const { totalModelsByType, allSelectedByType } = useMemo(() => {
    const total = {
      'self-hosted': modelsData.filter(m => m.type === 'self-hosted').length,
      github: modelsData.filter(m => m.type === 'github').length,
    };
    const selectedCount = {
      'self-hosted': modelsData.filter(m => m.type === 'self-hosted' && selected.includes(m.id)).length,
      github: modelsData.filter(m => m.type === 'github' && selected.includes(m.id)).length,
    };

    return {
      totalModelsByType: total,
      allSelectedByType: {
        'self-hosted': total['self-hosted'] > 0 && selectedCount['self-hosted'] === total['self-hosted'],
        github: total.github > 0 && selectedCount.github === total.github,
      } as Record<'self-hosted' | 'github', boolean>,
    };
  }, [modelsData, selected]);

  const modelIdToName = useCallback(
    (id: string) => modelsData.find(m => m.id === id)?.name || id,
    [modelsData],
  );

  const updateModelAvailability = useCallback((modelId: string, available: boolean) => {
    setModelsData(prev =>
      prev.map(model =>
        model.id === modelId ? { ...model, available } : model
      )
    );
  }, []);

  // Auto-switch to API model when all self-hosted models are offline
  useEffect(() => {
    const currentModel = modelsData.find(m => m.id === chatModelId);
    const allSelfHosted = modelsData.filter(m => m.type === 'self-hosted');
    const allSelfHostedOffline = allSelfHosted.length > 0 && allSelfHosted.every(m => m.available === false);

    // If current model is offline or null, and all self-hosted models are offline, switch to first API model
    if (allSelfHostedOffline && (!currentModel || currentModel.available === false)) {
      const firstApiModel = modelsData.find(m => m.type === 'github' && m.available !== false);
      if (firstApiModel && firstApiModel.id !== chatModelId) {
        setChatModelId(firstApiModel.id);
      }
    }
  }, [modelsData, chatModelId, setChatModelId]);

  const getModelEndpoints = useCallback((models: Model[]): Record<string, string> => {
    const endpoints: Record<string, string> = {};
    const isDev = window.location.hostname === 'localhost';

    const subdomainMap: Record<string, string> = {
      'qwen3-4b': 'qwen',
      'phi-3-mini': 'phi',
      'functiongemma-270m-it': 'functiongemma',
      'smollm3-3b': 'smollm3',
      'lfm2.5-1.2b-instruct': 'lfm2',
      'dasd-4b-thinking': 'dasd',
      'agentcpm-explore-4b': 'agentcpm',
      'gemma-3-12b-it': 'gemma',
      'llama-3.2-3b': 'llama',
      'mistral-7b-instruct-v0.3': 'mistral',
      'rnj-1-instruct': 'rnj',
      'deepseek-r1-distill-qwen-1.5b': 'r1qwen',
      'nanbeige4-3b-thinking': 'nanbeige',
      'z-ai/glm-4.5-air:free': 'glm',
      'gpt-oss-20b': 'gptoss',
    };

    const portMap: Record<string, number> = {
      'qwen3-4b': 8100,
      'phi-3-mini': 8110,
      'functiongemma-270m-it': 8120,
      'smollm3-3b': 8130,
      'lfm2.5-1.2b-instruct': 8140,
      'dasd-4b-thinking': 8300,
      'agentcpm-explore-4b': 8310,
      'gemma-3-12b-it': 8200,
      'llama-3.2-3b': 8210,
      'mistral-7b-instruct-v0.3': 8220,
      'rnj-1-instruct': 8230,
      'deepseek-r1-distill-qwen-1.5b': 8320,
      'nanbeige4-3b-thinking': 8330,
      'z-ai/glm-4.5-air:free': 8340,
      'gpt-oss-20b': 8350,
    };

    models.forEach(model => {
      if (model.type === 'self-hosted') {
        if (isDev) {
          const port = portMap[model.id] || 8000;
          endpoints[model.id] = `http://localhost:${port}`;
        } else {
          const subdomain = subdomainMap[model.id];
          if (subdomain) {
            endpoints[model.id] = `https://${subdomain}.neevs.io`;
          }
        }
      } else if (model.type === 'github') {
        endpoints[model.id] = config.apiBaseUrl || 'https://llm-api.jonasneves.workers.dev';
      }
    });

    return endpoints;
  }, []);

  return {
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
    updateModelAvailability,
    isLoading,
    loadError,
    retryCount,
    retryNow,
    getModelEndpoints,
  };
}
