import { useCallback, useRef } from 'react';
import { Model } from '../types';

type PendingChunks = Record<string, { answer: string; thinking: string }>;

export function useStreamAccumulator(
  setModelsData: React.Dispatch<React.SetStateAction<Model[]>>,
) {
  const pendingStreamRef = useRef<PendingChunks>({});
  const flushStreamRafRef = useRef<number | null>(null);

  const flushPendingStream = useCallback(() => {
    flushStreamRafRef.current = null;
    const pending = pendingStreamRef.current;
    pendingStreamRef.current = {};
    const ids = Object.keys(pending);
    if (!ids.length) return;

    setModelsData(prev => prev.map(model => {
      const delta = pending[model.id];
      if (!delta) return model;
      return {
        ...model,
        response: (model.response || '') + delta.answer,
        thinking: (model.thinking || '') + delta.thinking,
      };
    }));
  }, [setModelsData]);

  const scheduleFlush = useCallback(() => {
    if (flushStreamRafRef.current == null) {
      flushStreamRafRef.current = requestAnimationFrame(flushPendingStream);
    }
  }, [flushPendingStream]);

  const enqueueStreamDelta = useCallback((modelId: string, answerAdd: string, thinkingAdd: string) => {
    if (!answerAdd && !thinkingAdd) return;
    const existing = pendingStreamRef.current[modelId] || { answer: '', thinking: '' };
    existing.answer += answerAdd;
    existing.thinking += thinkingAdd;
    pendingStreamRef.current[modelId] = existing;
    scheduleFlush();
  }, [scheduleFlush]);

  const clearPendingStreamForModel = useCallback((modelId: string) => {
    if (pendingStreamRef.current[modelId]) {
      delete pendingStreamRef.current[modelId];
    }
  }, []);

  const resetPendingStream = useCallback(() => {
    pendingStreamRef.current = {};
    if (flushStreamRafRef.current != null) {
      cancelAnimationFrame(flushStreamRafRef.current);
      flushStreamRafRef.current = null;
    }
  }, []);

  return {
    enqueueStreamDelta,
    clearPendingStreamForModel,
    resetPendingStream,
  };
}
