import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertCircle, CheckCircle, Settings, RefreshCw, Globe, Eye, EyeOff, Rocket, Database, HelpCircle, WifiOff } from 'lucide-react';
import { SERVICES, buildEndpoint, EnvConfig, ProfileId, normalizeEnvConfig } from '../hooks/useExtensionConfig';
import DeploymentsPanel from './DeploymentsPanel';

interface ServiceHealth {
  key: string;
  name: string;
  endpoint: string;
  status: 'ok' | 'down' | 'checking';
}

const DEFAULT_CONFIG: EnvConfig = {
  githubToken: '',
  profile: 'local_all',
  chatApiBaseUrl: 'http://localhost:8080',
  modelsBaseDomain: '',
  modelsUseHttps: false,
};

type Tab = 'backend' | 'deployments' | 'services';

/**
 * Build all endpoints from base domain
 */
function buildAllEndpoints(baseDomain: string, useHttps: boolean): Record<string, string> {
  const endpoints: Record<string, string> = {};
  for (const service of SERVICES) {
    endpoints[service.key] = buildEndpoint(service.key, service.localPort, baseDomain, useHttps);
  }
  return endpoints;
}

const ServerPanel: React.FC = () => {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [config, setConfig] = useState<EnvConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<Tab>('backend');
  const [backendStatus, setBackendStatus] = useState<{ process: 'running' | 'stopped' | 'unknown'; mode: string | null }>({ process: 'unknown', mode: null });
  const [backendBusy, setBackendBusy] = useState(false);
  const [, setActiveDeployments] = useState(0);

  // Build services list from config
  const buildServicesList = useCallback((cfg: EnvConfig): ServiceHealth[] => {
    return SERVICES.map(service => ({
      key: service.key,
      name: service.name,
      endpoint: buildEndpoint(service.key, service.localPort, cfg.modelsBaseDomain, cfg.modelsUseHttps),
      status: 'checking' as const,
    }));
  }, []);

  const checkHealth = useCallback(async (servicesList: ServiceHealth[]) => {
    setLastCheck(new Date());
    const results = await Promise.all(
      servicesList.map(async (service) => {
        try {
          const response = await fetch(`${service.endpoint}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
          });
          return { ...service, status: response.ok ? 'ok' : 'down' } as ServiceHealth;
        } catch {
          return { ...service, status: 'down' } as ServiceHealth;
        }
      })
    );
    setServices(results);
  }, []);

  // Native messaging helper
  const nativeRequest = async (payload: any) => {
    const isNativeAvailable = () =>
      typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

    if (!isNativeAvailable()) {
      return { ok: false, error: 'Native messaging unavailable' };
    }

    try {
      const response: any = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'NATIVE_MESSAGE', payload }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(resp);
          }
        });
      });
      return response;
    } catch (err: any) {
      return { ok: false, error: err.message || 'Request failed' };
    }
  };

  // Backend controls
  const startBackend = async () => {
    setBackendBusy(true);

    const isLocalChat = config.chatApiBaseUrl.includes('localhost') || config.chatApiBaseUrl.includes('127.0.0.1');
    if (!isLocalChat) {
      setBackendBusy(false);
      return;
    }

    const mode = config.modelsBaseDomain ? 'dev-remote' : 'dev-interface-local';
    const resp = await nativeRequest({ action: 'start', mode });

    if (resp?.ok) {
      setBackendStatus({ process: 'running', mode });
    }

    setBackendBusy(false);
  };

  const stopBackend = async () => {
    setBackendBusy(true);
    await nativeRequest({ action: 'stop' });
    setBackendStatus({ process: 'stopped', mode: null });
    setBackendBusy(false);
  };

  useEffect(() => {
    // Load saved config from chrome storage
    chrome.storage.local.get(['envConfig'], (result: { envConfig?: EnvConfig }) => {
      const loadedConfig = normalizeEnvConfig(result.envConfig || DEFAULT_CONFIG);
      setConfig(loadedConfig);

      const servicesList = buildServicesList(loadedConfig);
      setServices(servicesList);

      // Initial health check only if on services tab
      if (activeTab === 'services') {
        setTimeout(() => checkHealth(servicesList), 500);
      }
    });
  }, [buildServicesList, checkHealth]);

  // Set up periodic health checks only when on services tab
  useEffect(() => {
    if (activeTab !== 'services') return;

    const interval = setInterval(() => {
      setServices(current => {
        if (current.length > 0) {
          checkHealth(current);
        }
        return current;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab, checkHealth]);

  const saveConfig = () => {
    // Build the full endpoints object for the main app
    const endpoints = buildAllEndpoints(config.modelsBaseDomain, config.modelsUseHttps);

    // Save config with computed endpoints
    const configToSave = {
      ...config,
      // Also save individual endpoints for backward compatibility
      qwenEndpoint: endpoints.qwen,
      phiEndpoint: endpoints.phi,
      llamaEndpoint: endpoints.llama,
      mistralEndpoint: endpoints.mistral,
      gemmaEndpoint: endpoints.gemma,
      r1qwenEndpoint: endpoints.r1qwen,
      rnjEndpoint: endpoints.rnj,
    };

    chrome.storage.local.set({ envConfig: configToSave }, () => {
      const servicesList = buildServicesList(config);
      setServices(servicesList);
      if (activeTab === 'services') {
        checkHealth(servicesList);
      }
    });
  };

  const getStatusIcon = (status: string) => {
    if (status === 'ok') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === 'down') return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />;
  };

  const healthyCount = services.filter(s => s.status === 'ok').length;
  const isUsingRemoteModels = !!config.modelsBaseDomain;

  const getProfileIndicatorStyle = () => {
    const profiles: ProfileId[] = ['local_chat_remote_models', 'remote_all', 'local_all'];
    const index = profiles.indexOf(config.profile as ProfileId);
    if (index === -1) return { left: '2px', width: 'calc(33.33% - 4px)' };
    return { left: `calc(${index * 33.33}% + 2px)`, width: 'calc(33.33% - 4px)' };
  };

  const getTabIndicatorStyle = () => {
    const tabs: Tab[] = ['backend', 'deployments', 'services'];
    const index = tabs.indexOf(activeTab);
    return { left: `calc(${index * 33.33}% + 3px)`, width: 'calc(33.33% - 6px)' };
  };

  const getProfileSliderClass = () => {
    if (config.profile === 'local_chat_remote_models') return 'profile-slider dev';
    if (config.profile === 'remote_all') return 'profile-slider prod';
    if (config.profile === 'local_all') return 'profile-slider local';
    return 'profile-slider dev';
  };

  const openChat = () => {
    if (config.profile === 'remote_all') {
      window.open('https://chat.neevs.io', '_blank');
    } else {
      window.open('http://localhost:8080', '_blank');
    }
  };

  const applyProfile = (profile: ProfileId) => {
    if (profile === 'remote_all') {
      setConfig({
        ...config,
        profile,
        chatApiBaseUrl: 'https://chat.neevs.io',
        modelsBaseDomain: 'neevs.io',
        modelsUseHttps: true,
      });
      saveConfig();
      return;
    }
    if (profile === 'local_chat_remote_models') {
      setConfig({
        ...config,
        profile,
        chatApiBaseUrl: 'http://localhost:8080',
        modelsBaseDomain: 'neevs.io',
        modelsUseHttps: true,
      });
      saveConfig();
      return;
    }
    if (profile === 'local_all') {
      setConfig({
        ...config,
        profile,
        chatApiBaseUrl: 'http://localhost:8080',
        modelsBaseDomain: '',
        modelsUseHttps: false,
      });
      saveConfig();
      return;
    }
    setConfig({ ...config, profile: 'custom' });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Arrow key navigation for tabs
      if (!showConfig && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const tabs: Tab[] = ['backend', 'deployments', 'services'];
        const currentIndex = tabs.indexOf(activeTab);
        if (e.key === 'ArrowLeft') {
          const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
          setActiveTab(tabs[prevIndex]);
        } else {
          const nextIndex = (currentIndex + 1) % tabs.length;
          setActiveTab(tabs[nextIndex]);
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'p') {
          e.preventDefault();
          const profiles: ProfileId[] = ['remote_all', 'local_chat_remote_models', 'local_all'];
          const currentIndex = profiles.indexOf(config.profile as ProfileId);
          const nextIndex = (currentIndex + 1) % profiles.length;
          applyProfile(profiles[nextIndex]);
        } else if (e.key === 'o') {
          e.preventDefault();
          openChat();
        } else if (e.key === 'b') {
          e.preventDefault();
          // Toggle backend start/stop
          const isLocalChat = config.chatApiBaseUrl.includes('localhost') || config.chatApiBaseUrl.includes('127.0.0.1');
          if (isLocalChat && !backendBusy) {
            if (backendStatus.process === 'running') {
              stopBackend();
            } else {
              startBackend();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [config.profile, config.chatApiBaseUrl, backendStatus.process, backendBusy, activeTab, showConfig]);

  return (
    <div className="min-h-screen font-sans bg-slate-950 text-slate-100">
      {/* Unified Header */}
      <div className="server-header">
        {/* Profile Switcher */}
        <div className="profile-track" title="⌘/Ctrl+P to cycle profiles">
          <div className={getProfileSliderClass()} style={getProfileIndicatorStyle()} />
          <button
            onClick={() => applyProfile('local_chat_remote_models')}
            className={`profile-btn ${config.profile === 'local_chat_remote_models' ? 'active' : ''}`}
          >
            Dev
          </button>
          <button
            onClick={() => applyProfile('remote_all')}
            className={`profile-btn ${config.profile === 'remote_all' ? 'active' : ''}`}
          >
            Prod
          </button>
          <button
            onClick={() => applyProfile('local_all')}
            className={`profile-btn ${config.profile === 'local_all' ? 'active' : ''}`}
          >
            Local
          </button>
        </div>

        {/* Settings */}
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="icon-btn"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Navigation */}
      {!showConfig && (
        <div className="p-3 pb-0">
          <div className="server-tabs relative flex">
            <div className="mode-slider absolute top-[3px] bottom-[3px] rounded-md transition-all duration-300" style={getTabIndicatorStyle()} />
            <button
              onClick={() => setActiveTab('backend')}
              className={`mode-btn ${activeTab === 'backend' ? 'active' : ''}`}
            >
              <Database className="w-3.5 h-3.5" />
              Backend
            </button>
            <button
              onClick={() => setActiveTab('deployments')}
              className={`mode-btn ${activeTab === 'deployments' ? 'active' : ''}`}
            >
              <Rocket className="w-3.5 h-3.5" />
              Deploy
            </button>
            <button
              onClick={() => {
                setActiveTab('services');
                checkHealth(services);
              }}
              className={`mode-btn ${activeTab === 'services' ? 'active' : ''}`}
            >
              <Activity className="w-3.5 h-3.5" />
              Services
              {services.length > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded ${
                  healthyCount === services.length ? 'bg-green-600/30 text-green-300' :
                  healthyCount > 0 ? 'bg-amber-600/30 text-amber-300' :
                  'bg-red-600/30 text-red-300'
                }`}>
                  {healthyCount}/{services.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {showConfig ? (
        <div className="p-3 space-y-3">
          {/* GitHub Token - Most Important */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              GitHub Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={config.githubToken}
                onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                className="w-full px-2.5 py-1.5 pr-8 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="github_pat_..."
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {!config.githubToken && (
              <p className="text-[10px] text-amber-400/80 mt-1">
                Required for deployments.{' '}
                <a
                  href="https://github.com/settings/tokens/new?description=Serverless+LLM+Extension&scopes=repo,workflow&default_expires_at=none"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-300"
                >
                  Create token →
                </a>
              </p>
            )}
          </div>

          {/* Advanced Settings - Collapsible */}
          <details className="group">
            <summary className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-300">
              <span className="group-open:rotate-90 transition-transform">▶</span>
              Advanced Settings
            </summary>
            <div className="mt-3 space-y-3 pl-4 border-l border-slate-700/50">
              {/* Chat API */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Chat API URL</label>
                <input
                  type="text"
                  value={config.chatApiBaseUrl}
                  onChange={(e) => setConfig({ ...config, profile: 'custom', chatApiBaseUrl: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="http://localhost:8080"
                />
              </div>

              {/* Models Domain */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Models Domain</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.modelsBaseDomain}
                    onChange={(e) => setConfig({ ...config, profile: 'custom', modelsBaseDomain: e.target.value.trim() })}
                    className="flex-1 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    placeholder="neevs.io (or empty for localhost)"
                  />
                  {config.modelsBaseDomain && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={config.modelsUseHttps}
                        onChange={(e) => setConfig({ ...config, profile: 'custom', modelsUseHttps: e.target.checked })}
                        className="w-3 h-3 rounded bg-slate-800 border-slate-700"
                      />
                      HTTPS
                    </label>
                  )}
                </div>
              </div>
            </div>
          </details>

          {/* Save Button */}
          <button
            onClick={saveConfig}
            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors"
          >
            Save
          </button>
        </div>
      ) : (
        <div className="p-3 pt-0">
          {activeTab === 'backend' ? (
            <DeploymentsPanel
              githubToken={config.githubToken}
              chatApiBaseUrl={config.chatApiBaseUrl}
              modelsBaseDomain={config.modelsBaseDomain}
              showOnlyBackend={true}
              onBackendStatusChange={setBackendStatus}
              onActiveDeploymentsChange={setActiveDeployments}
            />
          ) : activeTab === 'deployments' ? (
            <DeploymentsPanel
              githubToken={config.githubToken}
              chatApiBaseUrl={config.chatApiBaseUrl}
              modelsBaseDomain={config.modelsBaseDomain}
              showOnlyBackend={false}
              onBackendStatusChange={setBackendStatus}
              onActiveDeploymentsChange={setActiveDeployments}
            />
          ) : (
            <>
              {/* Connection Status Summary */}
              <div className="mb-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-300">
                      {isUsingRemoteModels ? config.modelsBaseDomain : 'localhost'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {healthyCount}/{services.length} online
                  </div>
                </div>
              </div>

              {/* Service Health */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Service Health
                    <span title="Model inference endpoints health status">
                      <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
                    </span>
                  </h2>
                  <button
                    onClick={() => checkHealth(services)}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {/* Empty state when all services are down */}
                {healthyCount === 0 && services.every(s => s.status === 'down') && (
                  <div className="mb-4 p-4 text-center bg-slate-900/50 rounded-lg border border-slate-700/30">
                    <WifiOff className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm text-slate-400 mb-1">All services offline</p>
                    <p className="text-xs text-slate-500 mb-3">
                      {config.modelsBaseDomain 
                        ? `Cannot reach ${config.modelsBaseDomain}` 
                        : 'Local model servers are not running'}
                    </p>
                    {!config.modelsBaseDomain && (
                      <button
                        onClick={() => applyProfile('local_chat_remote_models')}
                        className="px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded transition-colors"
                      >
                        Switch to Cloud Models
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {services.map((service) => (
                    <div
                      key={service.key}
                      className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded"
                      title={`Endpoint: ${service.endpoint}`}
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(service.status)}
                        <span className="text-sm">{service.name}</span>
                      </div>
                      <span className="text-xs text-slate-500 truncate max-w-[120px]" title={service.endpoint}>
                        {service.endpoint.replace('https://', '').replace('http://', '')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Last check: {lastCheck.toLocaleTimeString()}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ServerPanel;
