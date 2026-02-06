import { useEffect, useCallback, useRef } from 'react';
import { Model } from '../types';
import { config } from '../config';
import { fetchWithTimeout } from '../utils/fetch';

const HEALTH_CHECK_INTERVAL = 30000; // Check every 30 seconds
const INITIAL_CHECK_DELAY = 2000; // Wait 2s after initial load
const HEALTH_CHECK_TIMEOUT = 5000; // 5s timeout for health checks
const STAGGER_DELAY = 200; // 200ms delay between each health check to avoid thundering herd

export function useModelHealth(
  models: Model[],
  updateModelAvailability: (modelId: string, available: boolean) => void
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkModelHealth = useCallback(async (modelId: string) => {
    try {
      const response = await fetchWithTimeout(
        `${config.apiBaseUrl}/api/models/${modelId}/status`,
        undefined,
        HEALTH_CHECK_TIMEOUT
      );

      if (response.ok) {
        const data = await response.json();
        updateModelAvailability(modelId, data.status === 'online');
      } else {
        updateModelAvailability(modelId, false);
      }
    } catch {
      updateModelAvailability(modelId, false);
    }
  }, [updateModelAvailability]);

  const checkAllModels = useCallback(async () => {
    const selfHosted = models.filter(m => m.type === 'self-hosted');

    // Stagger health checks to avoid thundering herd
    for (let i = 0; i < selfHosted.length; i++) {
      checkModelHealth(selfHosted[i].id);

      if (i < selfHosted.length - 1) {
        await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY));
      }
    }
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
