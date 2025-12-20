import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Settings, RefreshCw, Globe, Eye, EyeOff, Sparkles, ExternalLink } from 'lucide-react';
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
  profile: 'local_chat_remote_models',
  chatApiBaseUrl: 'http://localhost:8080',
  modelsBaseDomain: 'neevs.io',
  modelsUseHttps: true,
};

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
  const [, setBackendStatus] = useState<{ process: 'running' | 'stopped' | 'unknown'; mode: string | null }>({ process: 'unknown', mode: null });
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

  useEffect(() => {
    // Load saved config from chrome storage
    chrome.storage.local.get(['envConfig'], (result: { envConfig?: EnvConfig }) => {
      const loadedConfig = normalizeEnvConfig(result.envConfig || DEFAULT_CONFIG);
      setConfig(loadedConfig);

      const servicesList = buildServicesList(loadedConfig);
      setServices(servicesList);

      // Initial health check after short delay
      setTimeout(() => checkHealth(servicesList), 1000);
    });
  }, [buildServicesList, checkHealth]);

  // Set up periodic health checks
  useEffect(() => {
    const interval = setInterval(() => {
      setServices(current => {
        if (current.length > 0) {
          checkHealth(current);
        }
        return current;
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [checkHealth]);

  const saveConfig = () => {
    const endpoints = buildAllEndpoints(config.modelsBaseDomain, config.modelsUseHttps);

    const configToSave = {
      ...config,
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
      checkHealth(servicesList);
    });
  };

  const healthyCount = services.filter(s => s.status === 'ok').length;

  const getProfileIndicatorStyle = () => {
    const profiles: ProfileId[] = ['local_chat_remote_models', 'remote_all'];
    const index = profiles.indexOf(config.profile as ProfileId);
    if (index === -1) return { left: '2px', width: 'calc(50% - 4px)' };
    return { left: `calc(${index * 50}% + 2px)`, width: 'calc(50% - 4px)' };
  };

  const applyProfile = (profile: ProfileId) => {
    if (profile === 'remote_all') {
      const newConfig = {
        ...config,
        profile,
        chatApiBaseUrl: 'https://chat.neevs.io',
        modelsBaseDomain: 'neevs.io',
        modelsUseHttps: true,
      };
      setConfig(newConfig);
      chrome.storage.local.set({ envConfig: newConfig });
      return;
    }
    if (profile === 'local_chat_remote_models') {
      const newConfig = {
        ...config,
        profile,
        chatApiBaseUrl: 'http://localhost:8080',
        modelsBaseDomain: 'neevs.io',
        modelsUseHttps: true,
      };
      setConfig(newConfig);
      chrome.storage.local.set({ envConfig: newConfig });
      return;
    }
    setConfig({ ...config, profile: 'custom' });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'p') {
          e.preventDefault();
          const profiles: ProfileId[] = ['local_chat_remote_models', 'remote_all'];
          const currentIndex = profiles.indexOf(config.profile as ProfileId);
          const nextIndex = (currentIndex + 1) % profiles.length;
          applyProfile(profiles[nextIndex]);
        } else if (e.key === 'o') {
          e.preventDefault();
          const url = config.profile === 'remote_all' ? 'https://chat.neevs.io' : 'http://localhost:8080';
          window.open(url, '_blank');
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [config.profile]);

  return (
    <div className="min-h-screen font-sans bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Compact Header */}
      <div className="relative z-10 px-4 py-2.5 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          {/* Profile Switcher */}
          <div
            className="relative flex p-0.5 bg-slate-800/60 rounded-full border border-slate-700/40"
            title="⌘/Ctrl+P to cycle profiles"
          >
            <div
              className={`absolute top-0.5 bottom-0.5 rounded-full transition-all duration-300 ease-out ${config.profile === 'remote_all'
                ? 'bg-gradient-to-r from-blue-500/40 to-blue-600/40 border border-blue-500/30'
                : 'bg-gradient-to-r from-emerald-500/40 to-emerald-600/40 border border-emerald-500/30'
                }`}
              style={getProfileIndicatorStyle()}
            />
            <button
              onClick={() => applyProfile('local_chat_remote_models')}
              className={`relative z-10 px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${config.profile === 'local_chat_remote_models' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Local
            </button>
            <button
              onClick={() => applyProfile('remote_all')}
              className={`relative z-10 px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${config.profile === 'remote_all' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Cloud
            </button>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${showConfig
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            title="Settings"
          >
            <Settings className={`w-4 h-4 transition-transform duration-300 ${showConfig ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {showConfig ? (
        <div className="relative z-10 p-4 space-y-4">
          {/* Settings Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-slate-700/30">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Configuration</h2>
          </div>

          {/* GitHub Token */}
          <div className="p-3 rounded-xl bg-slate-800/40 backdrop-blur-sm border border-slate-700/30">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-200 mb-2">
              <Globe className="w-3.5 h-3.5 text-purple-400" />
              GitHub Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={config.githubToken}
                onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                className="w-full px-3 py-2 pr-10 bg-slate-900/60 border border-slate-600/40 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-all"
                placeholder="github_pat_..."
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {!config.githubToken && (
              <p className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400/90">
                <AlertCircle className="w-3 h-3" />
                Required for deployments.{' '}
                <a
                  href="https://github.com/settings/tokens/new?description=Serverless+LLM+Extension&scopes=repo,workflow&default_expires_at=none"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-300 inline-flex items-center gap-1"
                >
                  Create token <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
            )}
            {config.githubToken && (
              <p className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400/90">
                <CheckCircle className="w-3 h-3" />
                Token configured
              </p>
            )}
          </div>

          {/* Advanced Settings */}
          <details className="group">
            <summary className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
              <span className="group-open:rotate-90 transition-transform duration-200">▶</span>
              Advanced Settings
            </summary>
            <div className="mt-3 p-3 space-y-3 rounded-xl bg-slate-800/30 border border-slate-700/20">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">Chat API URL</label>
                <input
                  type="text"
                  value={config.chatApiBaseUrl}
                  onChange={(e) => setConfig({ ...config, profile: 'custom', chatApiBaseUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-600/40 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="http://localhost:8080"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">Models Domain</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.modelsBaseDomain}
                    onChange={(e) => setConfig({ ...config, profile: 'custom', modelsBaseDomain: e.target.value.trim() })}
                    className="flex-1 px-3 py-2 bg-slate-900/60 border border-slate-600/40 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="neevs.io (or empty for localhost)"
                  />
                  {config.modelsBaseDomain && (
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/60 border border-slate-600/40 rounded-lg text-[11px] text-slate-300 cursor-pointer hover:border-slate-500/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={config.modelsUseHttps}
                        onChange={(e) => setConfig({ ...config, profile: 'custom', modelsUseHttps: e.target.checked })}
                        className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 accent-blue-500"
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
            className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl text-sm font-medium text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all active:scale-[0.98]"
          >
            Save Configuration
          </button>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col h-[calc(100vh-60px)]">
          {/* Main Content - scrollable */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <DeploymentsPanel
              githubToken={config.githubToken}
              chatApiBaseUrl={config.chatApiBaseUrl}
              modelsBaseDomain={config.modelsBaseDomain}
              showOnlyBackend={false}
              onBackendStatusChange={setBackendStatus}
              onActiveDeploymentsChange={setActiveDeployments}
            />
          </div>

          {/* Compact Status Bar - fixed at bottom */}
          <div className="flex-shrink-0 px-4 py-2 bg-slate-900/80 backdrop-blur-xl border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                {services.slice(0, 6).map((service) => (
                  <div
                    key={service.key}
                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-800/40 rounded-full"
                    title={`${service.name}: ${service.status}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${service.status === 'ok' ? 'bg-emerald-400'
                      : service.status === 'down' ? 'bg-red-400'
                        : 'bg-blue-400 animate-pulse'
                      }`} />
                    <span className="text-[9px] text-slate-500">{service.name.split(' ')[0]}</span>
                  </div>
                ))}
                {services.length > 6 && (
                  <span className="text-[9px] text-slate-600">+{services.length - 6}</span>
                )}
              </div>
              <button
                onClick={() => checkHealth(services)}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                title={`Last check: ${lastCheck.toLocaleTimeString()}`}
              >
                <RefreshCw className="w-3 h-3" />
                <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${healthyCount === services.length ? 'text-emerald-400'
                  : healthyCount > 0 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                  {healthyCount}/{services.length}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerPanel;
