/**
 * Runtime configuration for API endpoints
 * Supports both build-time (Vite env vars) and runtime (window config) settings
 */

export interface AppConfig {
  apiBaseUrl: string;
  isProduction: boolean;
}

let cachedConfig: AppConfig | null = null;

function getConfig(): AppConfig {
  // Return cached config if already computed
  if (cachedConfig) return cachedConfig;

  // Priority 1: Runtime config (set by config.js loaded in index.html)
  const runtimeConfig = (window as any).__APP_CONFIG__;
  if (runtimeConfig?.apiBaseUrl) {
    cachedConfig = {
      apiBaseUrl: runtimeConfig.apiBaseUrl,
      isProduction: true,
    };
    console.log('[Config] Using runtime config:', cachedConfig.apiBaseUrl);
    return cachedConfig;
  }

  // Priority 2: Extension mode (from setApiBase)
  const extensionApi = (window as any).__API_BASE__;
  if (extensionApi) {
    cachedConfig = {
      apiBaseUrl: extensionApi,
      isProduction: true,
    };
    console.log('[Config] Using extension config:', cachedConfig.apiBaseUrl);
    return cachedConfig;
  }

  // Priority 3: Build-time environment variable
  const buildTimeApi = import.meta.env.VITE_API_BASE_URL;
  if (buildTimeApi) {
    cachedConfig = {
      apiBaseUrl: buildTimeApi,
      isProduction: import.meta.env.PROD,
    };
    console.log('[Config] Using build-time config:', cachedConfig.apiBaseUrl);
    return cachedConfig;
  }

  // Fallback: Same-origin (development or bundled deployment)
  cachedConfig = {
    apiBaseUrl: '',
    isProduction: import.meta.env.PROD,
  };
  console.log('[Config] Using same-origin (fallback)');
  return cachedConfig;
}

// Export as getter property to ensure latest config
export const config = new Proxy({} as AppConfig, {
  get(_target, prop) {
    return getConfig()[prop as keyof AppConfig];
  }
});
