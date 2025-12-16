import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Model } from '../types';
import { MODEL_META } from '../constants';
import { usePersistedSetting } from './usePersistedSetting';

interface ModelsApiModel {
  id: string;
  name?: string;
  type?: string;
}

interface ModelsApiResponse {
  models: ModelsApiModel[];
}

export function useModelsManager() {
  const [modelsData, setModelsData] = useState<Model[]>([]);
  const [persistedSelected, setPersistedSelected] = usePersistedSetting<string[] | null>('playground_selected_models', null);
  const isSelectionInitialized = useRef(persistedSelected !== null);

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

    async function loadModels() {
      try {
        const response = await fetch('/api/models');
        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.status}`);
        }

        const data: ModelsApiResponse = await response.json();
        if (!isActive) return;

        const apiModels = data.models.map((model) => {
          const modelType: 'local' | 'api' = model.type === 'api' ? 'api' : 'local';
          const meta = MODEL_META[modelType];
          return {
            id: model.id,
            name: meta.name || model.name || model.id,
            color: meta.color,
            type: modelType,
            response: 'Ready to generate...',
          };
        });

        setModelsData(apiModels);

        if (!isSelectionInitialized.current) {
          setPersistedSelected(apiModels.filter(m => m.type === 'local').map(m => m.id));
          isSelectionInitialized.current = true;
        }

        const apiModeratorCandidate = apiModels.find(m => m.type === 'api');
        const fallbackModerator = apiModels[0]?.id || '';
        setModerator(apiModeratorCandidate?.id || fallbackModerator);
      } catch (error) {
        console.error('Failed to fetch models:', error);
      }
    }

    loadModels();
    return () => {
      isActive = false;
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
    moderator,
    setModerator,
    availableModels,
    totalModelsByType,
    allSelectedByType,
    modelIdToName,
  };
}
