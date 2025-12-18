import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertCircle, CheckCircle, Settings, RefreshCw, Server, Globe, Eye, EyeOff, Rocket, Database, ArrowRight, MessageSquare, HelpCircle, Cloud, WifiOff, Link2, ChevronDown, ExternalLink } from 'lucide-react';
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
  const [showChatMenu, setShowChatMenu] = useState(false);

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

  const openFullApp = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  };

  const getStatusIcon = (status: string) => {
    if (status === 'ok') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === 'down') return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />;
  };

  const healthyCount = services.filter(s => s.status === 'ok').length;
  const isUsingRemoteModels = !!config.modelsBaseDomain;

  const getProfileDisplayName = (profile: ProfileId) => {
    if (profile === 'remote_all') return 'Production (Cloud)';
    if (profile === 'local_chat_remote_models') return 'Development (Local+Cloud)';
    if (profile === 'local_all') return 'Offline (Fully Local)';
    return 'Custom';
  };

  const getProfileStatusColor = (profile: ProfileId) => {
    if (profile === 'remote_all') return 'text-emerald-400';
    if (profile === 'local_chat_remote_models') return 'text-blue-400';
    if (profile === 'local_all') return 'text-amber-400';
    return 'text-slate-400';
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
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'p') {
          e.preventDefault();
          const profiles: ProfileId[] = ['remote_all', 'local_chat_remote_models', 'local_all'];
          const currentIndex = profiles.indexOf(config.profile as ProfileId);
          const nextIndex = (currentIndex + 1) % profiles.length;
          applyProfile(profiles[nextIndex]);
        } else if (e.key === 'o') {
          e.preventDefault();
          openFullApp();
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [config.profile]);

  // Close chat menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showChatMenu && !target.closest('.relative')) {
        setShowChatMenu(false);
      }
    };
    if (showChatMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showChatMenu]);

  return (
    <div className={`p-4 min-h-screen font-sans transition-colors ${
      config.profile === 'remote_all' ? 'bg-slate-900' :
      config.profile === 'local_chat_remote_models' ? 'bg-slate-900' :
      'bg-slate-900'
    }`}>
      {/* Enhanced Header */}
      <div className="mb-4 space-y-3">
        {/* Top Bar with Title and Primary Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              config.profile === 'remote_all' ? 'bg-blue-600/20' :
              config.profile === 'local_chat_remote_models' ? 'bg-emerald-600/20' :
              'bg-amber-600/20'
            }`}>
              {config.profile === 'remote_all' ? <Cloud className="w-5 h-5 text-blue-400" /> :
               config.profile === 'local_chat_remote_models' ? <Link2 className="w-5 h-5 text-emerald-400" /> :
               <Server className="w-5 h-5 text-amber-400" />}
            </div>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2 text-white">
                {getProfileDisplayName(config.profile)}
                <span title="Ctrl+P to cycle profiles, Ctrl+O to open chat">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                </span>
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="truncate">{config.chatApiBaseUrl.includes('localhost') ? 'localhost' : 'cloud'}</span>
                <ArrowRight className="w-3 h-3" />
                <span className="truncate">{config.modelsBaseDomain || 'localhost'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Chat App Dropdown */}
            <div className="relative">
              <div className="flex">
                <button
                  onClick={openFullApp}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-l font-medium transition-colors text-sm text-white"
                  title="Open extension chat (Ctrl+O)"
                >
                  <MessageSquare className="w-4 h-4" />
                  Open Chat
                </button>
                <button
                  onClick={() => setShowChatMenu(!showChatMenu)}
                  className="px-2 py-2 bg-blue-600 hover:bg-blue-700 rounded-r border-l border-blue-700 transition-colors text-white"
                  title="More options"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
              {showChatMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => { openFullApp(); setShowChatMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 rounded-t-lg flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Extension Dashboard</span>
                  </button>
                  {(config.chatApiBaseUrl.includes('localhost') || config.chatApiBaseUrl.includes('127.0.0.1') || config.chatApiBaseUrl.includes('0.0.0.0')) && (
                    <button
                      onClick={() => { window.open('http://localhost:8080', '_blank'); setShowChatMenu(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Local Web (localhost:8080)</span>
                    </button>
                  )}
                  {config.profile === 'remote_all' && (
                    <button
                      onClick={() => { window.open('https://chat.neevs.io', '_blank'); setShowChatMenu(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 rounded-b-lg flex items-center gap-2"
                    >
                      <Cloud className="w-4 h-4" />
                      <span>Remote Web (chat.neevs.io)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2 hover:bg-slate-800 rounded transition-colors text-slate-300 hover:text-white"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Profile Toggle + Backend Status + Model Health */}
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Quick Switch:</span>
            <div className="flex gap-1">
              <button
                onClick={() => applyProfile('local_chat_remote_models')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  config.profile === 'local_chat_remote_models'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
                title="Development mode (Ctrl+P)"
              >
                Dev
              </button>
              <button
                onClick={() => applyProfile('remote_all')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  config.profile === 'remote_all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
                title="Production mode (Ctrl+P)"
              >
                Prod
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Backend Status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                backendStatus.process === 'running' ? 'bg-green-500' :
                backendStatus.process === 'stopped' ? 'bg-red-500' :
                'bg-slate-500'
              }`}></div>
              <span className="text-xs text-slate-300">
                Backend: {backendStatus.process}
                {backendStatus.mode && <span className="text-slate-500"> ({backendStatus.mode})</span>}
              </span>
            </div>

            {/* Model Health */}
            <div className="flex items-center gap-2">
              {healthyCount === services.length ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              ) : healthyCount > 0 ? (
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className="text-xs text-slate-300">
                Models: {healthyCount}/{services.length}
              </span>
            </div>
          </div>
        </div>

        {/* GitHub Token Warning */}
        {!config.githubToken && (
          <div className="p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg flex items-center gap-2 text-amber-300">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">
              GitHub token required for deployments.
              <button
                onClick={() => setShowConfig(true)}
                className="ml-2 underline hover:text-amber-200"
              >
                Configure →
              </button>
            </span>
          </div>
        )}
      </div>

      {showConfig ? (
        <div className="space-y-4 mb-6">
          {/* Profile */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Environment Profile</label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <button
                onClick={() => applyProfile('remote_all')}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  config.profile === 'remote_all'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
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
            <label className="block text-sm font-medium text-slate-300 mb-1">Chat API Base URL</label>
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
            <label className="block text-sm font-medium text-slate-300 mb-1">GitHub Token</label>
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
        <>
          {/* Profile Status Indicator */}
          <div className="mb-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getProfileStatusColor(config.profile).replace('text-', 'bg-')}`}></div>
                <span className="text-sm font-medium text-slate-300">{getProfileDisplayName(config.profile)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="truncate max-w-[100px]">
                  {config.chatApiBaseUrl.includes('localhost') ? 'localhost' : new URL(config.chatApiBaseUrl).host}
                </span>
                <ArrowRight className="w-3 h-3" />
                <span className="truncate max-w-[100px]">
                  {config.modelsBaseDomain || 'localhost'}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700 mb-4">
            <button
              onClick={() => setActiveTab('backend')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${activeTab === 'backend'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
                }`}
            >
              <Database className="w-3.5 h-3.5" />
              Backend
            </button>
            <button
              onClick={() => setActiveTab('deployments')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${activeTab === 'deployments'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
                }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              Deploy
            </button>
            <button
              onClick={() => {
                setActiveTab('services');
                checkHealth(services);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${activeTab === 'services'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
                }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Services
            </button>
          </div>

          {activeTab === 'backend' ? (
            <DeploymentsPanel
              githubToken={config.githubToken}
              chatApiBaseUrl={config.chatApiBaseUrl}
              modelsBaseDomain={config.modelsBaseDomain}
              showOnlyBackend={true}
              onBackendStatusChange={setBackendStatus}
            />
          ) : activeTab === 'deployments' ? (
            <DeploymentsPanel
              githubToken={config.githubToken}
              chatApiBaseUrl={config.chatApiBaseUrl}
              modelsBaseDomain={config.modelsBaseDomain}
              showOnlyBackend={false}
              onBackendStatusChange={setBackendStatus}
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
                  </h2>
                  <button
                    onClick={() => checkHealth(services)}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Refresh
                  </button>
                </div>
                <div className="space-y-2">
                  {services.map((service) => (
                    <div
                      key={service.key}
                      className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded"
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
        </>
      )}
    </div>
  );
};

export default ServerPanel;
