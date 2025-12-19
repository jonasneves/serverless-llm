import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertCircle, CheckCircle, Settings, RefreshCw, Globe, Eye, EyeOff, Rocket, Database, HelpCircle, WifiOff, Sparkles, ExternalLink, Zap } from 'lucide-react';
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

// Status glow colors
const STATUS_GLOW = {
  ok: 'shadow-[0_0_8px_rgba(34,197,94,0.6)]',
  down: 'shadow-[0_0_8px_rgba(239,68,68,0.6)]',
  checking: 'shadow-[0_0_8px_rgba(59,130,246,0.6)]',
};

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

  const healthyCount = services.filter(s => s.status === 'ok').length;
  const isUsingRemoteModels = !!config.modelsBaseDomain;

  const getProfileIndicatorStyle = () => {
    const profiles: ProfileId[] = ['local_chat_remote_models', 'remote_all'];
    const index = profiles.indexOf(config.profile as ProfileId);
    if (index === -1) return { left: '2px', width: 'calc(50% - 4px)' };
    return { left: `calc(${index * 50}% + 2px)`, width: 'calc(50% - 4px)' };
  };

  const getTabIndicatorStyle = () => {
    const tabs: Tab[] = ['backend', 'deployments', 'services'];
    const index = tabs.indexOf(activeTab);
    return { left: `calc(${index * 33.33}% + 3px)`, width: 'calc(33.33% - 6px)' };
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
          const profiles: ProfileId[] = ['local_chat_remote_models', 'remote_all'];
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
      
      {/* Premium Header with Glassmorphism */}
      <div className="relative z-10 px-4 py-3 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white/90 tracking-tight">Serverless LLM</span>
          </div>
          
          {/* Profile Switcher - Pill Style */}
          <div className="flex items-center gap-2">
            <div 
              className="relative flex p-0.5 bg-slate-800/60 rounded-full border border-slate-700/40" 
              title="⌘/Ctrl+P to cycle profiles"
            >
              <div 
                className={`absolute top-0.5 bottom-0.5 rounded-full transition-all duration-300 ease-out ${
                  config.profile === 'remote_all' 
                    ? 'bg-gradient-to-r from-blue-500/40 to-blue-600/40 border border-blue-500/30' 
                    : 'bg-gradient-to-r from-emerald-500/40 to-emerald-600/40 border border-emerald-500/30'
                }`}
                style={getProfileIndicatorStyle()}
              />
              <button
                onClick={() => applyProfile('local_chat_remote_models')}
                className={`relative z-10 px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${
                  config.profile === 'local_chat_remote_models' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Dev
              </button>
              <button
                onClick={() => applyProfile('remote_all')}
                className={`relative z-10 px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${
                  config.profile === 'remote_all' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Prod
              </button>
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${
                showConfig 
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Settings"
            >
              <Settings className={`w-4 h-4 transition-transform duration-300 ${showConfig ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation - Premium Style */}
      {!showConfig && (
        <div className="relative z-10 px-4 pt-4 pb-2">
          <div className="relative flex p-1 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/30">
            {/* Animated sliding indicator */}
            <div 
              className="absolute top-1 bottom-1 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/20 transition-all duration-300 ease-out"
              style={getTabIndicatorStyle()}
            />
            
            <button
              onClick={() => setActiveTab('backend')}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'backend' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className={`w-3.5 h-3.5 transition-colors ${activeTab === 'backend' ? 'text-blue-400' : ''}`} />
              Backend
            </button>
            
            <button
              onClick={() => setActiveTab('deployments')}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'deployments' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Rocket className={`w-3.5 h-3.5 transition-colors ${activeTab === 'deployments' ? 'text-purple-400' : ''}`} />
              Deploy
            </button>
            
            <button
              onClick={() => {
                setActiveTab('services');
                checkHealth(services);
              }}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'services' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className={`w-3.5 h-3.5 transition-colors ${activeTab === 'services' ? 'text-emerald-400' : ''}`} />
              Services
              {services.length > 0 && (
                <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-full ${
                  healthyCount === services.length 
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' 
                    : healthyCount > 0 
                      ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' 
                      : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                }`}>
                  {healthyCount}/{services.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {showConfig ? (
        <div className="relative z-10 p-4 space-y-4">
          {/* Settings Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-slate-700/30">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Configuration</h2>
          </div>
          
          {/* GitHub Token - Most Important */}
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

          {/* Advanced Settings - Collapsible */}
          <details className="group">
            <summary className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
              <span className="group-open:rotate-90 transition-transform duration-200">▶</span>
              Advanced Settings
            </summary>
            <div className="mt-3 p-3 space-y-3 rounded-xl bg-slate-800/30 border border-slate-700/20">
              {/* Chat API */}
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

              {/* Models Domain */}
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
        <div className="relative z-10 px-4 pb-4">
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
              {/* Connection Status Summary - Premium Card */}
              <div className="mb-4 p-4 rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-800/40 backdrop-blur-sm border border-slate-700/30 shadow-xl shadow-black/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      healthyCount === services.length 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : healthyCount > 0 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : 'bg-red-500/20 text-red-400'
                    }`}>
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {isUsingRemoteModels ? config.modelsBaseDomain : 'localhost'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {healthyCount === services.length 
                          ? 'All services healthy' 
                          : healthyCount > 0 
                            ? 'Some services unavailable' 
                            : 'Services offline'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      healthyCount === services.length 
                        ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' 
                        : healthyCount > 0 
                          ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' 
                          : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                    }`}>
                      {healthyCount}/{services.length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Health */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Service Health
                    <span title="Model inference endpoints health status">
                      <HelpCircle className="w-3 h-3 text-slate-500 cursor-help hover:text-slate-300 transition-colors" />
                    </span>
                  </h2>
                  <button
                    onClick={() => checkHealth(services)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                </div>

                {/* Empty state when all services are down */}
                {healthyCount === 0 && services.every(s => s.status === 'down') && (
                  <div className="mb-4 p-6 text-center rounded-2xl bg-slate-900/60 border border-slate-700/30">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-800/60 flex items-center justify-center">
                      <WifiOff className="w-7 h-7 text-slate-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-300 mb-1">All services offline</p>
                    <p className="text-xs text-slate-500">
                      Cannot reach {config.modelsBaseDomain || 'model servers'}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {services.map((service) => (
                    <div
                      key={service.key}
                      className="group flex items-center justify-between px-3 py-2.5 bg-slate-800/40 hover:bg-slate-800/60 rounded-xl border border-transparent hover:border-slate-700/40 transition-all cursor-default"
                      title={`Endpoint: ${service.endpoint}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          service.status === 'ok' 
                            ? `bg-emerald-400 ${STATUS_GLOW.ok}` 
                            : service.status === 'down' 
                              ? `bg-red-400 ${STATUS_GLOW.down}` 
                              : `bg-blue-400 ${STATUS_GLOW.checking} animate-pulse`
                        }`} />
                        <span className="text-sm text-slate-200 group-hover:text-white transition-colors">{service.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 group-hover:text-slate-400 truncate max-w-[140px] transition-colors" title={service.endpoint}>
                        {service.endpoint.replace('https://', '').replace('http://', '')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
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
