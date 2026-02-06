import { useEffect, useCallback, useRef } from 'react';
import { Model } from '../types';
import { config } from '../config';

const HEALTH_CHECK_INTERVAL = 30000; // Check every 30 seconds
const INITIAL_CHECK_DELAY = 2000; // Wait 2s after initial load

export function useModelHealth(
  models: Model[],
  updateModelAvailability: (modelId: string, available: boolean) => void
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkModelHealth = useCallback(async (modelId: string, type: string) => {
    // Only check self-hosted models
    if (type !== 'self-hosted') {
      updateModelAvailability(modelId, true);
      return;
    }

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/models/${modelId}/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        updateModelAvailability(modelId, data.status === 'online');
      } else {
        updateModelAvailability(modelId, false);
      }
    } catch (error) {
      updateModelAvailability(modelId, false);
    }
  }, [updateModelAvailability]);

  const checkAllModels = useCallback(async () => {
    await Promise.all(
      models.map(model => checkModelHealth(model.id, model.type || 'self-hosted'))
    );
  }, [models, checkModelHealth]);

  useEffect(() => {
    // Initial check after a short delay
    initialCheckRef.current = setTimeout(() => {
      checkAllModels();
    }, INITIAL_CHECK_DELAY);

    // Periodic health checks
    intervalRef.current = setInterval(() => {
      checkAllModels();
    }, HEALTH_CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (initialCheckRef.current) {
        clearTimeout(initialCheckRef.current);
      }
    };
  }, [checkAllModels]);

  return { checkAllModels };
}
