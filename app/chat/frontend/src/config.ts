/**
 * Runtime configuration for API endpoints
 * Supports both build-time (Vite env vars) and runtime (window config) settings
 */

export interface AppConfig {
  apiBaseUrl: string;
}

let cachedConfig: AppConfig | null = null;

function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  // Priority 1: Runtime config (set by config.js loaded in index.html)
  const runtimeConfig = (window as any).__APP_CONFIG__;
  if (runtimeConfig?.apiBaseUrl) {
    cachedConfig = { apiBaseUrl: runtimeConfig.apiBaseUrl };
    console.log('[Config] Using runtime config:', cachedConfig.apiBaseUrl);
    return cachedConfig;
  }

  // Priority 2: Extension mode (from setApiBase)
  const extensionApi = (window as any).__API_BASE__;
  if (extensionApi) {
    cachedConfig = { apiBaseUrl: extensionApi };
    console.log('[Config] Using extension config:', cachedConfig.apiBaseUrl);
    return cachedConfig;
  }

  // Priority 3: Build-time environment variable
  const buildTimeApi = import.meta.env.VITE_API_BASE_URL;
  if (buildTimeApi) {
    cachedConfig = { apiBaseUrl: buildTimeApi };
    console.log('[Config] Using build-time config:', cachedConfig.apiBaseUrl);
    return cachedConfig;
  }

  // Fallback: Worker proxy (production default)
  cachedConfig = { apiBaseUrl: 'https://llm-api.jonasneves.workers.dev' };
  console.log('[Config] Using Worker proxy (fallback)');
  return cachedConfig;
}

// Export as getter property to ensure latest config
export const config = new Proxy({} as AppConfig, {
  get(_target, prop) {
    return getConfig()[prop as keyof AppConfig];
  }
});
