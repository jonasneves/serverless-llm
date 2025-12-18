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

export interface EnvConfig {
  githubToken: string;
  baseDomain: string;
  useHttps: boolean;
}

const DEFAULT_CONFIG: EnvConfig = {
  githubToken: '',
  baseDomain: 'chat.neevs.io',  // Default to hosted backend
  useHttps: true,
};

export function buildEndpoint(serviceKey: string, localPort: number, baseDomain: string, useHttps: boolean): string {
  if (!baseDomain) {
    return `http://localhost:${localPort}`;
  }
  return `${useHttps ? 'https' : 'http'}://${serviceKey}.${baseDomain}`;
}

function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function buildApiBaseUrl(config: EnvConfig): string {
  if (!config.baseDomain) {
    return 'http://localhost:8080';
  }
  // For chat backend, remove service prefix (it's just the base domain)
  return `${config.useHttps ? 'https' : 'http'}://${config.baseDomain}`;
}

export function useExtensionConfig() {
  const [config, setConfig] = useState<EnvConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (isExtensionContext()) {
      // Extension mode: load from chrome.storage
      chrome.storage.local.get(['envConfig'], (result: { envConfig?: EnvConfig }) => {
        const loaded = { ...DEFAULT_CONFIG, ...result.envConfig };
        setConfig(loaded);
        setIsLoaded(true);

        // Set API base for streaming
        const apiBase = buildApiBaseUrl(loaded);
        setApiBase(apiBase);
        console.log('[Config] Extension mode, API base:', apiBase);
      });

      // Listen for changes from side panel
      const listener = (changes: { envConfig?: { newValue?: EnvConfig } }, areaName: string) => {
        if (areaName === 'local' && changes.envConfig?.newValue) {
          const updated = { ...DEFAULT_CONFIG, ...changes.envConfig.newValue };
          setConfig(updated);
          const apiBase = buildApiBaseUrl(updated);
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
