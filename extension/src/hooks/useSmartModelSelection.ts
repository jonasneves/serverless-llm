import { useRef } from 'react';
import { Model } from '../types';
import { getModelPriority } from '../constants';

const RATE_LIMIT_COOLDOWN = 60000; // 60 seconds

interface ModelWithMetadata extends Model {
    priority: number;
    isRateLimited: boolean;
    isLastSuccessful: boolean;
}

export function useSmartModelSelection() {
    const rateLimitedModels = useRef<Map<string, number>>(new Map());
    const lastSuccessfulModel = useRef<string | null>(null);

    const isRecentlyRateLimited = (modelId: string): boolean => {
        const timestamp = rateLimitedModels.current.get(modelId);
        if (!timestamp) return false;
        return Date.now() - timestamp < RATE_LIMIT_COOLDOWN;
    };

    const recordRateLimit = (modelId: string) => {
        rateLimitedModels.current.set(modelId, Date.now());
    };

    const recordSuccess = (modelId: string) => {
        lastSuccessfulModel.current = modelId;
        rateLimitedModels.current.delete(modelId);
    };

    const sortModels = (modelList: Model[]): Model[] => {
        const withMetadata: ModelWithMetadata[] = modelList.map(m => ({
            ...m,
            priority: getModelPriority(m.id, m.type || 'self-hosted', m.priority),
            isRateLimited: isRecentlyRateLimited(m.id),
            isLastSuccessful: m.id === lastSuccessfulModel.current
        }));

        // Split into available and rate-limited
        const available = withMetadata.filter(m => !m.isRateLimited);
        const rateLimited = withMetadata.filter(m => m.isRateLimited);

        // Sort available: last successful first, then by priority
        const sortedAvailable = available.sort((a, b) => {
            if (a.isLastSuccessful !== b.isLastSuccessful) {
                return a.isLastSuccessful ? -1 : 1;
            }
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            if (a.type !== b.type) {
                return a.type === 'self-hosted' ? -1 : 1;
            }
            return a.id.localeCompare(b.id);
        });

        // Sort rate-limited by priority (last resort)
        const sortedRateLimited = rateLimited.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.id.localeCompare(b.id);
        });

        return [...sortedAvailable, ...sortedRateLimited];
    };

    return {
        sortModels,
        recordRateLimit,
        recordSuccess,
        isRecentlyRateLimited,
        getLastSuccessfulModel: () => lastSuccessfulModel.current,
    };
}
