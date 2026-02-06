import { useEffect, useCallback, useRef } from 'react';
import { Model } from '../types';
import { config } from '../config';

const HEALTH_CHECK_INTERVAL = 30000; // Check every 30 seconds
const INITIAL_CHECK_DELAY = 2000; // Wait 2s after initial load
const HEALTH_CHECK_TIMEOUT = 5000; // 5s timeout for health checks
const STAGGER_DELAY = 200; // 200ms delay between each health check to avoid thundering herd

// Helper to fetch with timeout
function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

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
      const response = await fetchWithTimeout(
        `${config.apiBaseUrl}/api/models/${modelId}/status`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        HEALTH_CHECK_TIMEOUT
      );

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
    // Stagger health checks to avoid thundering herd problem
    // Check models sequentially with small delays between each
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      // Don't await - fire and forget, but stagger the starts
      checkModelHealth(model.id, model.type || 'self-hosted');

      // Add delay between checks (except after the last one)
      if (i < models.length - 1) {
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
