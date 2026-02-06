/**
 * Runtime configuration for API endpoints
 * Supports both build-time (Vite env vars) and runtime (window config) settings
 */

export interface AppConfig {
  apiBaseUrl: string;
  isProduction: boolean;
}

function getConfig(): AppConfig {
  // Priority 1: Runtime config (set by config.js loaded in index.html)
  const runtimeConfig = (window as any).__APP_CONFIG__;
  if (runtimeConfig?.apiBaseUrl) {
    return {
      apiBaseUrl: runtimeConfig.apiBaseUrl,
      isProduction: true,
    };
  }

  // Priority 2: Build-time environment variable
  const buildTimeApi = import.meta.env.VITE_API_BASE_URL;
  if (buildTimeApi) {
    return {
      apiBaseUrl: buildTimeApi,
      isProduction: import.meta.env.PROD,
    };
  }

  // Priority 3: Extension mode (from extension config)
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const extensionApi = (window as any).__API_BASE__;
    return {
      apiBaseUrl: extensionApi || 'https://chat.neevs.io',
      isProduction: true,
    };
  }

  // Fallback: Same-origin (development or bundled deployment)
  return {
    apiBaseUrl: '',
    isProduction: import.meta.env.PROD,
  };
}

export const config = getConfig();

// Log config in development
if (!config.isProduction) {
  console.log('[Config]', config);
}
