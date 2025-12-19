import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertCircle, CheckCircle, Settings, RefreshCw, Globe, Eye, EyeOff, Rocket, Database, HelpCircle, WifiOff, ExternalLink, Play, Square, RotateCw } from 'lucide-react';
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

  const restartBackend = async () => {
    await stopBackend();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await startBackend();
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

        {/* Backend Status */}
        <div className="backend-status" title="⌘/Ctrl+B to toggle backend">
          <span className={`status-dot ${
            backendStatus.process === 'running' ? 'bg-green-500' :
            backendStatus.process === 'stopped' ? 'bg-red-500' : 'bg-slate-500'
          }`} />
          <span>{backendStatus.process === 'running' ? 'Running' : backendStatus.process === 'stopped' ? 'Stopped' : '...'}</span>
          {backendStatus.process === 'running' ? (
            <>
              <button
                onClick={stopBackend}
                disabled={backendBusy}
                className="control-btn"
                title="Stop backend"
              >
                <Square className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={restartBackend}
                disabled={backendBusy}
                className="control-btn"
                title="Restart backend"
              >
                <RotateCw className="w-2.5 h-2.5" />
              </button>
            </>
          ) : (
            <button
              onClick={startBackend}
              disabled={backendBusy || config.profile === 'remote_all'}
              className="control-btn"
              title={config.profile === 'remote_all' ? 'Not available in Prod mode' : 'Start backend'}
            >
              <Play className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="header-actions">
          <button onClick={openChat} className="chat-btn" title="⌘/Ctrl+O to open chat">
            <ExternalLink className="w-3 h-3" />
            Chat
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="icon-btn"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
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
        <div className="p-3 space-y-4">
          {/* GitHub Token Warning */}
          {!config.githubToken && (
            <div className="p-2 bg-amber-950/30 border border-amber-900/40 rounded flex items-center gap-2 text-amber-400/90 text-[11px]">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>GitHub token required for deployments. Configure below.</span>
            </div>
          )}

          {/* Profile */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              Environment Profile
              <span title="Choose how chat and model services connect. Production uses cloud servers, Development runs chat locally with cloud models, Offline runs everything locally.">
                <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <button
                onClick={() => applyProfile('remote_all')}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  config.profile === 'remote_all'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
                title="Everything runs in the cloud. Zero setup required. Best for everyday use."
              >
                <div className="text-xs font-medium text-white mb-1">Production</div>
                <div className="text-[10px] text-slate-300">Chat: Cloud</div>
                <div className="text-[10px] text-slate-300">Models: Cloud</div>
                <div className="text-[10px] text-blue-400 mt-1">No setup</div>
              </button>
              <button
                onClick={() => applyProfile('local_chat_remote_models')}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  config.profile === 'local_chat_remote_models'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
                title="Run chat server locally for development, but use cloud models. Click 'Start' in Backend tab to launch."
              >
                <div className="text-xs font-medium text-white mb-1">Development</div>
                <div className="text-[10px] text-slate-300">Chat: Local</div>
                <div className="text-[10px] text-slate-300">Models: Cloud</div>
                <div className="text-[10px] text-emerald-400 mt-1">Click Start</div>
              </button>
              <button
                onClick={() => applyProfile('local_all')}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  config.profile === 'local_all'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
                title="Fully offline mode. Requires running model inference servers locally (make dev-interface-local)."
              >
                <div className="text-xs font-medium text-white mb-1">Offline</div>
                <div className="text-[10px] text-slate-300">Chat: Local</div>
                <div className="text-[10px] text-slate-300">Models: Local</div>
                <div className="text-[10px] text-amber-400 mt-1">Requires models</div>
              </button>
            </div>
            <button
              onClick={() => setConfig({ ...config, profile: 'custom' })}
              className={`w-full px-3 py-2 rounded border text-xs transition-colors ${
                config.profile === 'custom'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              Custom Configuration
            </button>
          </div>

          {/* Chat API */}
          <div className="pt-3 border-t border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
              Chat API Base URL
              <span title="The URL where the chat backend server runs. Use localhost:8080 for local development.">
                <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
              </span>
            </label>
            <input
              type="text"
              value={config.chatApiBaseUrl}
              onChange={(e) => setConfig({ ...config, profile: 'custom', chatApiBaseUrl: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="http://localhost:8080"
            />
            <p className="text-xs text-slate-500 mt-1">
              Used by the main app streaming API and the Deploy tab health check.
            </p>
          </div>

          {/* GitHub Token */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
              GitHub Token
              <span title="Personal Access Token with 'repo' and 'workflow' scopes. Required for GitHub Models API and triggering deployments.">
                <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
              </span>
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={config.githubToken}
                onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                className="w-full px-3 py-2 pr-10 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="github_pat_..."
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition-colors"
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Required for API models & deployments.{' '}
              <a
                href="https://github.com/settings/tokens/new?description=Serverless+LLM+Extension&scopes=repo,workflow&default_expires_at=none"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Create token →
              </a>
            </p>
          </div>

          {/* Models Base Domain */}
          <div className="pt-3 border-t border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Models Base Domain
              <span title="Base domain for model inference endpoints. Endpoints are constructed as https://[model].domain. Leave empty for localhost.">
                <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
              </span>
            </label>
            <input
              type="text"
              value={config.modelsBaseDomain}
              onChange={(e) => setConfig({ ...config, profile: 'custom', modelsBaseDomain: e.target.value.trim() })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="neevs.io"
            />
            <p className="text-xs text-slate-500 mt-1">
              {config.modelsBaseDomain
                ? `Endpoints: ${config.modelsUseHttps ? 'https' : 'http'}://[service].${config.modelsBaseDomain}`
                : 'Leave empty for localhost (default ports)'
              }
            </p>
          </div>

          {/* Models HTTPS Toggle */}
          {config.modelsBaseDomain && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="modelsUseHttps"
                checked={config.modelsUseHttps}
                onChange={(e) => setConfig({ ...config, profile: 'custom', modelsUseHttps: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700"
              />
              <label htmlFor="modelsUseHttps" className="text-sm text-slate-400">Use HTTPS</label>
            </div>
          )}

          {/* Preview Endpoints */}
          {config.modelsBaseDomain && (
            <div className="p-3 bg-slate-800/50 rounded border border-slate-700/50">
              <p className="text-xs font-medium text-slate-400 mb-2">Endpoint Preview</p>
              <div className="space-y-1 text-xs text-slate-500 font-mono">
                {SERVICES.slice(0, 3).map(s => (
                  <div key={s.key}>
                    {buildEndpoint(s.key, s.localPort, config.modelsBaseDomain, config.modelsUseHttps)}
                  </div>
                ))}
                <div className="text-slate-600">...and {SERVICES.length - 3} more</div>
              </div>
            </div>
          )}

          <button
            onClick={saveConfig}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors text-sm"
          >
            Save Configuration
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
