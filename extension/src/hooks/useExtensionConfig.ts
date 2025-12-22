/**
 * Hook to load extension configuration
 * - Extension mode: from chrome.storage
 * - Standalone sidepanel for Chrome extension
 */

import { useState, useEffect } from 'react';
import extensionConfig from '../data/extension-config.json';

// Types for generated config
export interface ServiceConfig {
  key: string;
  name: string;
  localPort: number;
  category: 'core' | 'small' | 'medium' | 'reasoning';
  modelId: string;
  rank: number;
}

export interface WorkflowConfig {
  name: string;
  path: string;
  category: 'core' | 'small' | 'medium' | 'reasoning';
  serviceKey?: string;
}

export interface CategoryConfig {
  id: string;
  name: string;
  description: string;
  order: number;
}

// Service definitions from extension-config.json
export const SERVICES: ServiceConfig[] = extensionConfig.services as ServiceConfig[];
export const WORKFLOWS: WorkflowConfig[] = extensionConfig.workflows as WorkflowConfig[];
export const CATEGORIES: CategoryConfig[] = extensionConfig.categories as CategoryConfig[];
export const CONFIG_GENERATED_AT = extensionConfig.generatedAt;

// Build workflow name -> path map for quick lookups
export const WORKFLOW_PATHS = new Map(WORKFLOWS.map(wf => [wf.name, wf.path]));

// Build service key -> workflow name map
export const SERVICE_TO_WORKFLOW = new Map(
  WORKFLOWS.filter(wf => wf.serviceKey).map(wf => [wf.serviceKey!, wf.name])
);

// Helper to get services by category
export function getServicesByCategory(category: string): ServiceConfig[] {
  return SERVICES.filter(s => s.category === category).sort((a, b) => a.rank - b.rank);
}

// Helper to get all services grouped by category
export function getServicesGroupedByCategory(): Map<string, ServiceConfig[]> {
  const grouped = new Map<string, ServiceConfig[]>();
  for (const category of CATEGORIES) {
    grouped.set(category.id, getServicesByCategory(category.id));
  }
  return grouped;
}

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
        console.log('[Config] Extension mode, API base:', loaded.chatApiBaseUrl);
      });

      // Listen for changes from side panel
      const listener = (changes: { envConfig?: { newValue?: EnvConfig } }, areaName: string) => {
        if (areaName === 'local' && changes.envConfig?.newValue) {
          const updated = normalizeEnvConfig(changes.envConfig.newValue);
          setConfig(updated);
          console.log('[Config] Updated API base:', updated.chatApiBaseUrl);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } else {
      // Web mode: use defaults
      setIsLoaded(true);
      console.log('[Config] Web mode, using defaults');
    }
  }, []);

  return { config, isLoaded };
}
