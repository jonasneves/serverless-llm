import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertCircle, CheckCircle, Settings, RefreshCw, Server, Globe, Eye, EyeOff, Rocket } from 'lucide-react';
import { SERVICES, buildEndpoint, EnvConfig } from '../hooks/useExtensionConfig';
import DeploymentsPanel from './DeploymentsPanel';

interface ServiceHealth {
  key: string;
  name: string;
  endpoint: string;
  status: 'ok' | 'down' | 'checking';
}

const DEFAULT_CONFIG: EnvConfig = {
  githubToken: '',
  baseDomain: '',
  useHttps: true,
};

type Tab = 'services' | 'deployments';

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
  const [activeTab, setActiveTab] = useState<Tab>('deployments');

  // Build services list from config
  const buildServicesList = useCallback((cfg: EnvConfig): ServiceHealth[] => {
    return SERVICES.map(service => ({
      key: service.key,
      name: service.name,
      endpoint: buildEndpoint(service.key, service.localPort, cfg.baseDomain, cfg.useHttps),
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
      const loadedConfig = result.envConfig || DEFAULT_CONFIG;
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
    const endpoints = buildAllEndpoints(config.baseDomain, config.useHttps);

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
  const isUsingRemote = !!config.baseDomain;

  return (
    <div className="p-4 bg-slate-900 text-white min-h-screen font-sans">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Server className="w-5 h-5" />
          Server Controls
        </h1>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="p-2 hover:bg-slate-800 rounded transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {showConfig ? (
        <div className="space-y-4 mb-6">
          {/* GitHub Token */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">GitHub Token</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={config.githubToken}
                onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
                className="w-full px-3 py-2 pr-10 bg-slate-800 border border-slate-700 rounded text-sm focus:outline-none focus:border-blue-500"
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

          {/* Base Domain */}
          <div className="pt-3 border-t border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Base Domain
            </label>
            <input
              type="text"
              value={config.baseDomain}
              onChange={(e) => setConfig({ ...config, baseDomain: e.target.value.trim() })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm focus:outline-none focus:border-blue-500"
              placeholder="neevs.io"
            />
            <p className="text-xs text-slate-500 mt-1">
              {config.baseDomain
                ? `Endpoints: ${config.useHttps ? 'https' : 'http'}://[service].${config.baseDomain}`
                : 'Leave empty for localhost (default ports)'
              }
            </p>
          </div>

          {/* HTTPS Toggle */}
          {config.baseDomain && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useHttps"
                checked={config.useHttps}
                onChange={(e) => setConfig({ ...config, useHttps: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700"
              />
              <label htmlFor="useHttps" className="text-sm text-slate-400">Use HTTPS</label>
            </div>
          )}

          {/* Preview Endpoints */}
          {config.baseDomain && (
            <div className="p-3 bg-slate-800/50 rounded border border-slate-700/50">
              <p className="text-xs font-medium text-slate-400 mb-2">Endpoint Preview</p>
              <div className="space-y-1 text-xs text-slate-500 font-mono">
                {SERVICES.slice(0, 3).map(s => (
                  <div key={s.key}>
                    {buildEndpoint(s.key, s.localPort, config.baseDomain, config.useHttps)}
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
          {/* Tabs */}
          <div className="flex border-b border-slate-700 mb-4">
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

          {activeTab === 'deployments' ? (
            <DeploymentsPanel githubToken={config.githubToken} />
          ) : (
            <>
              {/* Connection Status Summary */}
              <div className="mb-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-300">
                      {isUsingRemote ? config.baseDomain : 'localhost'}
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

          <div className="space-y-2 pt-4 border-t border-slate-700/50">
            <button
              onClick={openFullApp}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors"
            >
              Open Full App
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ServerPanel;
