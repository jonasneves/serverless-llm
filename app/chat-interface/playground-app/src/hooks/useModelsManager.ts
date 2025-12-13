import { useCallback, useEffect, useMemo, useState } from 'react';
import { Model } from '../types';
import { MODEL_META } from '../constants';

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
  const [selected, setSelected] = useState<string[]>([]);
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
        setSelected(apiModels.filter(m => m.type === 'local').map(m => m.id));

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
