import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppCard from './AppCard';
import BuildPanel from './BuildPanel';
import DeployPanel from './DeployPanel';
import ObservePanel from './ObservePanel';
import { SERVICES, buildEndpoint } from '../hooks/useExtensionConfig';

interface WorkflowRun {
    id: number;
    name: string;
    status: 'completed' | 'in_progress' | 'queued' | 'waiting' | 'failure';
    conclusion: 'success' | 'failure' | 'cancelled' | null;
    created_at: string;
    updated_at: string;
    html_url: string;
}

interface WorkflowInfo {
    id: number;
    name: string;
    path: string;
}

interface DeploymentsPanelProps {
    githubToken: string;
    chatApiBaseUrl: string;
    modelsBaseDomain: string;
    modelsUseHttps: boolean;
    globalTab: 'build' | 'deploy' | 'observe';
    showOnlyBackend?: boolean;
    onBackendStatusChange?: (status: { process: 'running' | 'stopped' | 'unknown'; mode: string | null }) => void;
    onActiveDeploymentsChange?: (count: number) => void;
}

const REPO_OWNER = 'jonasneves';
const REPO_NAME = 'serverless-llm';

const KEY_WORKFLOWS = [
    { name: 'Chat', path: 'chat.yml' },
    { name: 'Build Images', path: 'build-push-images.yml' },
    { name: 'Qwen', path: 'qwen-inference.yml' },
    { name: 'Phi', path: 'phi-inference.yml' },
    { name: 'Llama', path: 'llama-inference.yml' },
    { name: 'Mistral', path: 'mistral-inference.yml' },
  { name: 'Gemma', path: 'gemma-inference.yml' },
  { name: 'R1 Qwen', path: 'r1qwen-inference.yml' },
  { name: 'RNJ', path: 'rnj-inference.yml' },
];

const WORKFLOW_PATHS = new Map(KEY_WORKFLOWS.map(wf => [wf.name, wf.path]));

function normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

const DeploymentsPanel: React.FC<DeploymentsPanelProps> = ({ githubToken, chatApiBaseUrl, modelsBaseDomain, modelsUseHttps, globalTab, showOnlyBackend = false, onBackendStatusChange, onActiveDeploymentsChange }) => {
    const [workflows, setWorkflows] = useState<Map<string, WorkflowInfo>>(new Map());
    const [runs, setRuns] = useState<Map<string, WorkflowRun | null>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [triggering, setTriggering] = useState<string | null>(null);
    const [backendHealth, setBackendHealth] = useState<'ok' | 'down' | 'checking'>('checking');
    const [backendProcess, setBackendProcess] = useState<'running' | 'stopped' | 'unknown'>('unknown');
    const [backendPid, setBackendPid] = useState<number | null>(null);
    const [backendBusy, setBackendBusy] = useState(false);
    const [backendLogTail, setBackendLogTail] = useState<string | null>(null);
    const [backendNativeError, setBackendNativeError] = useState<string | null>(null);
    const [modelHealthStatuses, setModelHealthStatuses] = useState<Map<string, 'ok' | 'down' | 'checking'>>(new Map());
    const [buildBusy, setBuildBusy] = useState(false);
    const [buildLogTail, setBuildLogTail] = useState<string | null>(null);
    const [buildNativeError, setBuildNativeError] = useState<string | null>(null);
    const refreshInFlight = useRef(false);
    const workflowsRef = useRef<Map<string, WorkflowInfo>>(new Map());

    const headers = {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'serverless-llm-extension',
    };

    const checkBackendHealth = useCallback(async () => {
        setBackendHealth('checking');
        try {
            const baseUrl = normalizeBaseUrl(chatApiBaseUrl) || 'http://localhost:8080';
            const response = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                signal: AbortSignal.timeout(5000),
            });
            setBackendHealth(response.ok ? 'ok' : 'down');
        } catch {
            setBackendHealth('down');
        }
    }, [chatApiBaseUrl]);

    const checkModelHealth = useCallback(async (serviceKey: string, endpoint: string) => {
        try {
            const response = await fetch(`${endpoint}/health`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                signal: AbortSignal.timeout(3000),
            });
            setModelHealthStatuses(prev => new Map(prev).set(serviceKey, response.ok ? 'ok' : 'down'));
        } catch {
            setModelHealthStatuses(prev => new Map(prev).set(serviceKey, 'down'));
        }
    }, []);

    const checkAllModelsHealth = useCallback(async () => {
        for (const service of SERVICES) {
            const endpoint = buildEndpoint(service.key, service.localPort, modelsBaseDomain, modelsUseHttps);
            setModelHealthStatuses(prev => new Map(prev).set(service.key, 'checking'));
            await checkModelHealth(service.key, endpoint);
        }
    }, [modelsBaseDomain, modelsUseHttps, checkModelHealth]);

    const isNativeAvailable = () =>
        typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

    const nativeRequest = async (payload: any) => {
        if (!isNativeAvailable()) {
            return { ok: false, error: 'Native messaging unavailable' };
        }
        return await new Promise<any>((resolve) => {
            try {
                chrome.runtime.sendMessage({ type: 'native_backend', payload }, (response) => {
                    const err = chrome.runtime.lastError?.message;
                    if (err) resolve({ ok: false, error: err });
                    else resolve(response);
                });
            } catch (e: any) {
                resolve({ ok: false, error: e?.message || String(e) });
            }
        });
    };

    const refreshBackendStatus = useCallback(async () => {
        const normalized = normalizeBaseUrl(chatApiBaseUrl) || 'http://localhost:8080';
        const resp = await nativeRequest({ action: 'status', chatApiBaseUrl: normalized });
        if (resp?.ok) {
            const process = resp.status === 'running' ? 'running' : 'stopped';
            const mode = resp.mode ?? null;
            setBackendProcess(process);
            setBackendPid(resp.pid ?? null);
            setBackendNativeError(null);
            onBackendStatusChange?.({ process, mode });
            return;
        }
        setBackendNativeError(resp?.error || null);
        setBackendProcess('unknown');
        setBackendPid(null);
        onBackendStatusChange?.({ process: 'unknown', mode: null });
    }, [chatApiBaseUrl, onBackendStatusChange]);

    const startBackend = async () => {
        setBackendBusy(true);
        setBackendLogTail(null);
        setBackendNativeError(null);

        const isLocalChat = chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1');
        if (!isLocalChat) {
            setBackendNativeError('Backend start only works with local chat API');
            setBackendBusy(false);
            return;
        }

        const mode = modelsBaseDomain ? 'dev-chat' : 'dev-interface-local';
        const resp = await nativeRequest({ action: 'start', mode });
        if (!resp?.ok && resp?.logTail) setBackendLogTail(resp.logTail);
        if (!resp?.ok && resp?.error) setBackendNativeError(resp.error);
        await refreshBackendStatus();
        await checkBackendHealth();
        setBackendBusy(false);
    };

    const stopBackend = async () => {
        setBackendBusy(true);
        setBackendLogTail(null);
        setBackendNativeError(null);
        await nativeRequest({ action: 'stop' });
        await refreshBackendStatus();
        await checkBackendHealth();
        setBackendBusy(false);
    };

    const fetchBackendLogs = async () => {
        const resp = await nativeRequest({ action: 'logs' });
        if (resp?.ok) setBackendLogTail(resp.logTail || null);
        if (!resp?.ok && resp?.error) setBackendNativeError(resp.error);
    };

    const runBuild = async (target: 'playground' | 'extension' | 'both') => {
        setBuildBusy(true);
        setBuildLogTail(null);
        setBuildNativeError(null);

        const targets = target === 'both'
            ? ['build-playground', 'build-extension']
            : [`build-${target}`];

        for (const t of targets) {
            const resp = await nativeRequest({ action: 'make', target: t });
            if (resp?.logTail) setBuildLogTail(prev => prev ? `${prev}\n\n--- ${t} ---\n${resp.logTail}` : resp.logTail);
            if (!resp?.ok) {
                setBuildNativeError(resp?.error || `${t} failed`);
                setBuildBusy(false);
                return;
            }
        }

        setBuildBusy(false);
    };

    const fetchWorkflows = useCallback(async () => {
        if (!githubToken) {
            setError('GitHub token required');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch(
                `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows`,
                { headers }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const wfMap = new Map<string, WorkflowInfo>();
            for (const wf of data.workflows || []) {
                const key = KEY_WORKFLOWS.find(k => wf.path?.endsWith(k.path));
                if (key) wfMap.set(key.name, { id: wf.id, name: key.name, path: wf.path });
            }
            setWorkflows(wfMap);
            workflowsRef.current = wfMap;
            setError(null);
        } catch (err: any) {
            setError(err.message);
        }
    }, [githubToken]);

    const fetchLatestRuns = useCallback(async () => {
        if (!githubToken || workflowsRef.current.size === 0) return;

        const newRuns = new Map<string, WorkflowRun | null>();
        let activeCount = 0;

        for (const [name, wf] of workflowsRef.current) {
            try {
                const response = await fetch(
                    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${wf.id}/runs?per_page=1`,
                    { headers }
                );
                if (response.ok) {
                    const data = await response.json();
                    const run = data.workflow_runs?.[0] || null;
                    newRuns.set(name, run);
                    if (run?.status === 'in_progress' || run?.status === 'queued') activeCount++;
                }
            } catch {
                newRuns.set(name, null);
            }
        }

        setRuns(newRuns);
        onActiveDeploymentsChange?.(activeCount);
        setLoading(false);
    }, [githubToken, onActiveDeploymentsChange]);

    const refresh = useCallback(async () => {
        if (refreshInFlight.current) return;
        refreshInFlight.current = true;
        setLoading(true);
        await fetchWorkflows();
        await fetchLatestRuns();
        refreshInFlight.current = false;
    }, [fetchWorkflows, fetchLatestRuns]);

    const triggerWorkflow = async (workflowName: string) => {
        const wf = workflows.get(workflowName);
        if (!wf) return;

        setTriggering(workflowName);
        try {
            const response = await fetch(
                `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${wf.id}/dispatches`,
                {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ref: 'main' }),
                }
            );

            if (response.status === 204) {
                setTimeout(() => refresh(), 3000);
            } else {
                const errorData = await response.json().catch(() => ({}));
                setError(errorData.message || `Failed to trigger ${workflowName}`);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setTriggering(null);
        }
    };

    useEffect(() => {
        checkBackendHealth();
        refreshBackendStatus();
        checkAllModelsHealth();

        if (!showOnlyBackend) {
            fetchWorkflows().then(() => fetchLatestRuns());
        }
    }, [checkBackendHealth, refreshBackendStatus, checkAllModelsHealth, fetchWorkflows, fetchLatestRuns, showOnlyBackend]);

    useEffect(() => {
        if (showOnlyBackend) return;

        const interval = setInterval(() => {
            if (!refreshInFlight.current) {
                fetchLatestRuns();
            }
            checkAllModelsHealth();
        }, 30000);

        return () => clearInterval(interval);
    }, [fetchLatestRuns, showOnlyBackend, checkAllModelsHealth]);



    const defaultTabs: Record<string, 'build' | 'deploy' | 'observe'> = {
        'chat-api': 'observe',
    };
    SERVICES.forEach(service => {
        defaultTabs[service.key] = 'observe';
    });

    const [activeTabs, setActiveTabs] = useState<Record<string, 'build' | 'deploy' | 'observe'>>(defaultTabs);

    useEffect(() => {
        const updatedTabs: Record<string, 'build' | 'deploy' | 'observe'> = { 'chat-api': globalTab };
        SERVICES.forEach(service => {
            updatedTabs[service.key] = globalTab;
        });
        setActiveTabs(updatedTabs);
    }, [globalTab]);

    const setActiveTab = (appId: string, tab: 'build' | 'deploy' | 'observe') => {
        setActiveTabs(prev => ({ ...prev, [appId]: tab }));
    };

    const getDeploymentStatusForApp = (appId: string): 'success' | 'failure' | 'in_progress' | 'queued' | 'unknown' => {
        let workflowName: string | null = null;
        if (appId === 'chat-api') workflowName = 'Chat';
        else if (appId === 'qwen') workflowName = 'Qwen';
        else if (appId === 'phi') workflowName = 'Phi';
        else if (appId === 'llama') workflowName = 'Llama';
        else if (appId === 'mistral') workflowName = 'Mistral';
        else if (appId === 'gemma') workflowName = 'Gemma';
        else if (appId === 'r1qwen') workflowName = 'R1 Qwen';
        else if (appId === 'rnj') workflowName = 'RNJ';

        if (!workflowName) return 'unknown';

        const run = runs.get(workflowName);
        if (!run) return 'unknown';

        if (run.status === 'in_progress') return 'in_progress';
        if (run.status === 'queued') return 'queued';
        if (run.conclusion === 'success') return 'success';
        if (run.conclusion === 'failure') return 'failure';

        return 'unknown';
    };

    const buildWorkflowUrl = (workflowName: string | null) => {
        if (!workflowName) return undefined;
        const path = WORKFLOW_PATHS.get(workflowName);
        return path ? `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${path}` : `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`;
    };

    const chatEndpoint = normalizeBaseUrl(chatApiBaseUrl) || 'http://localhost:8080';
    const publicDomain = modelsBaseDomain || 'neevs.io';
    const publicScheme = modelsBaseDomain ? (modelsUseHttps ? 'https' : 'http') : 'https';
    const chatPublicUrl = (chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1'))
        ? `${publicScheme}://chat.${publicDomain}`
        : (normalizeBaseUrl(chatApiBaseUrl) || `${publicScheme}://chat.${publicDomain}`);

    const apps: Array<{
        id: string;
        name: string;
        status: 'running' | 'stopped' | 'building' | 'deploying' | 'ok' | 'down' | 'checking';
        deploymentStatus: 'success' | 'failure' | 'in_progress' | 'queued' | 'unknown';
        localStatus?: 'ok' | 'down' | 'checking';
        publicEndpoint: string;
        endpointUrl?: string;
        localEndpointUrl?: string;
        deploymentUrl?: string;
    }> = [
        {
            id: 'chat-api',
            name: 'Chat API',
            status: backendHealth === 'ok' ? 'running' : backendHealth === 'down' ? 'stopped' : 'checking',
            deploymentStatus: getDeploymentStatusForApp('chat-api'),
            localStatus: chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1') ? backendHealth : undefined,
            publicEndpoint: `chat.${publicDomain}`,
            endpointUrl: chatPublicUrl,
            localEndpointUrl: chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1') ? chatEndpoint : undefined,
            deploymentUrl: runs.get('Chat')?.html_url || buildWorkflowUrl('Chat'),
        },
        ...SERVICES.map(service => {
            const endpoint = buildEndpoint(service.key, service.localPort, modelsBaseDomain, modelsUseHttps);
            const health = modelHealthStatuses.get(service.key) || 'checking';
            const workflowName = service.name;
            const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
            const publicEndpointUrl = `${publicScheme}://${service.key}.${publicDomain}`;
            return {
                id: service.key,
                name: service.name,
                status: health,
                deploymentStatus: getDeploymentStatusForApp(service.key),
                localStatus: isLocal ? health : undefined,
                publicEndpoint: `${service.key}.${publicDomain}`,
                endpointUrl: publicEndpointUrl,
                localEndpointUrl: isLocal ? endpoint : undefined,
                deploymentUrl: runs.get(workflowName)?.html_url || buildWorkflowUrl(workflowName),
            };
        }),
    ];

    return (
        <div className="space-y-2 pt-1">
            {/* App Cards */}
            {apps.map((app) => {
                const activeTab = activeTabs[app.id] || 'observe';
                return (
                    <AppCard
                        key={app.id}
                        id={app.id}
                        name={app.name}
                        status={app.status}
                        activeMode={globalTab}
                        deploymentStatus={app.deploymentStatus}
                        localStatus={app.localStatus}
                        publicEndpoint={app.publicEndpoint}
                        endpointUrl={app.endpointUrl}
                        localEndpointUrl={app.localEndpointUrl}
                        deploymentUrl={app.deploymentUrl}
                        defaultExpanded={false}
                    >
                        {/* Tab Bar */}
                        <div className="flex gap-1 mb-3 bg-slate-900/40 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveTab(app.id, 'build')}
                                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                    activeTab === 'build'
                                        ? 'bg-slate-700/60 text-white'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Build
                            </button>
                            <button
                                onClick={() => setActiveTab(app.id, 'deploy')}
                                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                    activeTab === 'deploy'
                                        ? 'bg-slate-700/60 text-white'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Deploy
                            </button>
                            <button
                                onClick={() => setActiveTab(app.id, 'observe')}
                                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                    activeTab === 'observe'
                                        ? 'bg-slate-700/60 text-white'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Observe
                            </button>
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'build' && (
                            <BuildPanel
                                appId={app.id}
                                buildBusy={buildBusy}
                                buildLogTail={buildLogTail}
                                onBuild={runBuild}
                            />
                        )}
                        {activeTab === 'deploy' && (
                            <DeployPanel
                                appId={app.id}
                                githubToken={githubToken}
                                runs={runs}
                                triggering={triggering}
                                loading={loading}
                                onDeploy={triggerWorkflow}
                                onRefresh={refresh}
                            />
                        )}
                        {activeTab === 'observe' && (
                            <ObservePanel
                                appId={app.id}
                                backendHealth={backendHealth}
                                backendProcess={backendProcess}
                                backendPid={backendPid}
                                backendBusy={backendBusy}
                                backendLogTail={backendLogTail}
                                backendNativeError={backendNativeError}
                                chatApiBaseUrl={chatApiBaseUrl}
                                onStart={startBackend}
                                onStop={stopBackend}
                                onFetchLogs={fetchBackendLogs}
                            />
                        )}
                    </AppCard>
                );
            })}

            {/* Build Error (global) */}
            {buildNativeError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <span className="text-[10px] text-amber-300">{buildNativeError}</span>
                </div>
            )}

            {/* Deployment Error (global) */}
            {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <span className="text-[10px] text-amber-300">{error}</span>
                </div>
            )}
        </div>
    );
};

export default DeploymentsPanel;
