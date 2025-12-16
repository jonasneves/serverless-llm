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
const INITIAL_RETRY_DELAY = 500;   // Start with 500ms
const MAX_RETRY_DELAY = 4000;      // Cap at 4s
const MAX_RETRIES = 10;            // Give up after ~30s total

export function useModelsManager() {
  const [modelsData, setModelsData] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Multi-model selection (for Compare, Council, Roundtable, Personalities)
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

  useEffect(() => {
    let isActive = true;
    let retryCount = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    async function loadModels(): Promise<boolean> {
      try {
        const response = await fetch('/api/models');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: ModelsApiResponse = await response.json();
        if (!isActive) return true;

        // Check if we got actual models (backend might return empty during startup)
        if (!data.models || data.models.length === 0) {
          throw new Error('No models available');
        }

        const apiModels = data.models.map((model) => {
          const modelType: 'local' | 'api' = model.type === 'api' ? 'api' : 'local';
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

        setModelsData(apiModels);
        setIsLoading(false);
        setLoadError(null);

        // Initialize multi-model selection (for Compare, Council, etc.) with local models
        if (!isSelectionInitialized.current) {
          setPersistedSelected(apiModels.filter(m => m.type === 'local').map(m => m.id));
          isSelectionInitialized.current = true;
        }

        // Initialize chat model with first local model
        if (!isChatModelInitialized.current) {
          const firstLocalModel = apiModels.find(m => m.type === 'local');
          setChatModelId(firstLocalModel?.id || apiModels[0]?.id || null);
          isChatModelInitialized.current = true;
        }

        const apiModeratorCandidate = apiModels.find(m => m.type === 'api');
        const fallbackModerator = apiModels[0]?.id || '';
        setModerator(apiModeratorCandidate?.id || fallbackModerator);
        
        return true; // Success
      } catch (error) {
        console.warn(`Model fetch attempt ${retryCount + 1} failed:`, error);
        return false; // Failed, should retry
      }
    }

    async function loadWithRetry() {
      const success = await loadModels();
      
      if (!success && isActive && retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, retryCount - 1), MAX_RETRY_DELAY);
        setLoadError(`Connecting to backend... (attempt ${retryCount}/${MAX_RETRIES})`);
        retryTimeout = setTimeout(loadWithRetry, delay);
      } else if (!success && retryCount >= MAX_RETRIES) {
        setIsLoading(false);
        setLoadError('Could not connect to backend. Please refresh the page.');
      }
    }

    loadWithRetry();
    
    return () => {
      isActive = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  const availableModels = useMemo(
    () => modelsData.filter(m => !selected.includes(m.id)),
    [modelsData, selected],
  );

  const { totalModelsByType, allSelectedByType } = useMemo(() => {
    const total = {
      local: modelsData.filter(m => m.type === 'local').length,
      api: modelsData.filter(m => m.type === 'api').length,
    };
    const selectedCount = {
      local: modelsData.filter(m => m.type === 'local' && selected.includes(m.id)).length,
      api: modelsData.filter(m => m.type === 'api' && selected.includes(m.id)).length,
    };

    return {
      totalModelsByType: total,
      allSelectedByType: {
        local: total.local > 0 && selectedCount.local === total.local,
        api: total.api > 0 && selectedCount.api === total.api,
      } as Record<'local' | 'api', boolean>,
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
  };
}
