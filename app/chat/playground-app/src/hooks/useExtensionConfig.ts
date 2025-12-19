/**
 * Hook to load extension configuration
 * - Extension mode: from chrome.storage, sets API base URL
 * - Web mode: uses relative URLs (same origin)
 */

import { useState, useEffect } from 'react';
import { setApiBase } from '../utils/streaming';

// Service definitions
export const SERVICES = [
  { key: 'qwen', name: 'Qwen', localPort: 8001 },
  { key: 'phi', name: 'Phi', localPort: 8002 },
  { key: 'llama', name: 'Llama', localPort: 8003 },
  { key: 'r1qwen', name: 'R1 Qwen', localPort: 8004 },
  { key: 'mistral', name: 'Mistral', localPort: 8005 },
  { key: 'gemma', name: 'Gemma', localPort: 8006 },
  { key: 'rnj', name: 'RNJ', localPort: 8007 },
] as const;

export type ProfileId = 'remote_all' | 'local_chat_remote_models' | 'local_all' | 'custom';

export interface EnvConfig {
  githubToken: string;
  profile: ProfileId;
  chatApiBaseUrl: string;
  modelsBaseDomain: string;
  modelsUseHttps: boolean;
}

const DEFAULT_CONFIG: EnvConfig = {
  githubToken: '',
  profile: 'local_all',
  chatApiBaseUrl: 'http://localhost:8080',
  modelsBaseDomain: '',
  modelsUseHttps: false,
};

export function normalizeEnvConfig(raw: unknown): EnvConfig {
  const merged = { ...DEFAULT_CONFIG, ...(raw as any) } as any;

  // Legacy support: { baseDomain, useHttps } drove both chat + models.
  if ((!merged.chatApiBaseUrl || typeof merged.chatApiBaseUrl !== 'string') && typeof merged.baseDomain === 'string') {
    merged.chatApiBaseUrl = merged.baseDomain
      ? `${merged.useHttps === false ? 'http' : 'https'}://chat.${merged.baseDomain}`
      : 'http://localhost:8080';
    merged.profile = 'custom';
  }

  if ((!merged.modelsBaseDomain || typeof merged.modelsBaseDomain !== 'string') && typeof merged.baseDomain === 'string') {
    merged.modelsBaseDomain = merged.baseDomain;
    merged.profile = 'custom';
  }

  if (typeof merged.modelsUseHttps !== 'boolean' && typeof merged.useHttps === 'boolean') {
    merged.modelsUseHttps = merged.useHttps;
    merged.profile = 'custom';
  }

  const profile: ProfileId =
    merged.profile === 'remote_all' ||
    merged.profile === 'local_chat_remote_models' ||
    merged.profile === 'local_all' ||
    merged.profile === 'custom'
      ? merged.profile
      : DEFAULT_CONFIG.profile;

  return {
    githubToken: typeof merged.githubToken === 'string' ? merged.githubToken : DEFAULT_CONFIG.githubToken,
    profile,
    chatApiBaseUrl: normalizeChatApiBaseUrl(typeof merged.chatApiBaseUrl === 'string' ? merged.chatApiBaseUrl : ''),
    modelsBaseDomain: typeof merged.modelsBaseDomain === 'string' ? merged.modelsBaseDomain : DEFAULT_CONFIG.modelsBaseDomain,
    modelsUseHttps: typeof merged.modelsUseHttps === 'boolean' ? merged.modelsUseHttps : DEFAULT_CONFIG.modelsUseHttps,
  };
}

export function buildEndpoint(
  serviceKey: string,
  localPort: number,
  modelsBaseDomain: string,
  modelsUseHttps: boolean
): string {
  if (!modelsBaseDomain) {
    return `http://localhost:${localPort}`;
  }
  return `${modelsUseHttps ? 'https' : 'http'}://${serviceKey}.${modelsBaseDomain}`;
}

function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function normalizeChatApiBaseUrl(chatApiBaseUrl: string): string {
  const trimmed = chatApiBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'http://localhost:8080';
  return trimmed;
}

export function useExtensionConfig() {
  const [config, setConfig] = useState<EnvConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (isExtensionContext()) {
      // Extension mode: load from chrome.storage
      chrome.storage.local.get(['envConfig'], (result: { envConfig?: EnvConfig }) => {
        const loaded = normalizeEnvConfig(result.envConfig);
        setConfig(loaded);
        setIsLoaded(true);

        // Set API base for streaming
        const apiBase = normalizeChatApiBaseUrl(loaded.chatApiBaseUrl);
        setApiBase(apiBase);
        console.log('[Config] Extension mode, API base:', apiBase);
      });

      // Listen for changes from side panel
      const listener = (changes: { envConfig?: { newValue?: EnvConfig } }, areaName: string) => {
        if (areaName === 'local' && changes.envConfig?.newValue) {
          const updated = normalizeEnvConfig(changes.envConfig.newValue);
          setConfig(updated);
          const apiBase = normalizeChatApiBaseUrl(updated.chatApiBaseUrl);
          setApiBase(apiBase);
          console.log('[Config] Updated API base:', apiBase);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } else {
      // Web mode: use relative URLs (empty base)
      setIsLoaded(true);
      console.log('[Config] Web mode, using relative URLs');
    }
  }, []);

  return { config, isLoaded };
}
