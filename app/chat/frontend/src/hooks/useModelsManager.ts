import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Model } from '../types';
import { MODEL_META } from '../constants';
import { usePersistedSetting } from './usePersistedSetting';

interface ModelsApiModel {
  id: string;
  name?: string;
  type?: string;
  priority?: number;
  context_length?: number;
}

interface ModelsApiResponse {
  models: ModelsApiModel[];
}

// Retry config for initial model loading (handles cold starts)
const INITIAL_RETRY_DELAY = 800;   // Start with 800ms
const MAX_RETRY_DELAY = 3000;      // Cap at 3s
const MAX_RETRIES = 8;             // Give up after ~20s total

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
      const apiModels = data.models.map((model) => {
        const modelType: 'self-hosted' | 'github' | 'external' =
          (model.type === 'self-hosted' || model.type === 'github' || model.type === 'external')
            ? model.type
            : 'self-hosted';
        const meta = MODEL_META[modelType];
        return {
          id: model.id,
          name: meta.name || model.name || model.id,
          color: meta.color,
          type: modelType,
          response: 'Ready to generate...',
          priority: model.priority,
          context_length: model.context_length
        };
      });

      // Success! Update state
      setModelsData(apiModels);
      setIsLoading(false);
      setLoadError(null);
      setRetryCount(0);

      // Initialize multi-model selection (for Compare, Analyze, etc.) with self-hosted models
      if (!isSelectionInitialized.current) {
        setPersistedSelected(apiModels.filter(m => m.type === 'self-hosted').map(m => m.id));
        isSelectionInitialized.current = true;
      }

      // Initialize chat model with first github/external model, fallback to self-hosted
      if (!isChatModelInitialized.current) {
        const firstApiModel = apiModels.find(m => m.type === 'github' || m.type === 'external');
        setChatModelId(firstApiModel?.id || apiModels[0]?.id || null);
        isChatModelInitialized.current = true;
      }

      const apiModeratorCandidate = apiModels.find(m => m.type === 'github' || m.type === 'external');
      const fallbackModerator = apiModels[0]?.id || '';
      setModerator(apiModeratorCandidate?.id || fallbackModerator);
    };

    try {
      // Try backend API first
      const response = await fetch('/api/models');

      // Check if this fetch is still relevant
      if (fetchId !== fetchIdRef.current) return;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: ModelsApiResponse = await response.json();

      // Check again after parsing
      if (fetchId !== fetchIdRef.current) return;

      // Check if we got actual models (backend might return empty during startup)
      if (!data.models || data.models.length === 0) {
        throw new Error('No models available yet');
      }

      processModels(data);

    } catch (backendError) {
      // Check if this fetch is still relevant
      if (fetchId !== fetchIdRef.current) return;

      console.warn(`Backend fetch failed:`, backendError);

      // Try static models.json (for extension mode)
      try {
        console.log('Trying static models.json...');
        const staticResponse = await fetch('/models.json');

        if (staticResponse.ok) {
          const staticData = await staticResponse.json();
          if (staticData.models && staticData.models.length > 0) {
            console.log(`Loaded ${staticData.models.length} models from static file`);
            processModels(staticData);
            return;
          }
        }
      } catch (staticError) {
        console.warn('Static models.json not available:', staticError);
      }

      // Both failed - retry or give up
      const nextRetry = currentRetry + 1;
      setRetryCount(nextRetry);

      if (nextRetry < MAX_RETRIES) {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.4, currentRetry), MAX_RETRY_DELAY);
        setLoadError(`Connecting to backend...`);
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
    () => modelsData.filter(m => !selected.includes(m.id)),
    [modelsData, selected],
  );

  const { totalModelsByType, allSelectedByType } = useMemo(() => {
    const total = {
      'self-hosted': modelsData.filter(m => m.type === 'self-hosted').length,
      github: modelsData.filter(m => m.type === 'github').length,
      external: modelsData.filter(m => m.type === 'external').length,
    };
    const selectedCount = {
      'self-hosted': modelsData.filter(m => m.type === 'self-hosted' && selected.includes(m.id)).length,
      github: modelsData.filter(m => m.type === 'github' && selected.includes(m.id)).length,
      external: modelsData.filter(m => m.type === 'external' && selected.includes(m.id)).length,
    };

    return {
      totalModelsByType: total,
      allSelectedByType: {
        'self-hosted': total['self-hosted'] > 0 && selectedCount['self-hosted'] === total['self-hosted'],
        github: total.github > 0 && selectedCount.github === total.github,
        external: total.external > 0 && selectedCount.external === total.external,
      } as Record<'self-hosted' | 'github' | 'external', boolean>,
    };
  }, [modelsData, selected]);

  const modelIdToName = useCallback(
    (id: string) => modelsData.find(m => m.id === id)?.name || id,
    [modelsData],
  );

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
    isLoading,
    loadError,
    retryCount,
    retryNow,
  };
}
