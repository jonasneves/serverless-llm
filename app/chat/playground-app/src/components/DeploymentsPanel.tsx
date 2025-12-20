import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Rocket, RefreshCw, ExternalLink, AlertCircle, Power, Terminal, Zap, Package, Wrench, Globe } from 'lucide-react';

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
    showOnlyBackend?: boolean;
    onBackendStatusChange?: (status: { process: 'running' | 'stopped' | 'unknown'; mode: string | null }) => void;
    onActiveDeploymentsChange?: (count: number) => void;
}

const REPO_OWNER = 'jonasneves';
const REPO_NAME = 'serverless-llm';

const KEY_WORKFLOWS = [
    { name: 'Chat', path: 'chat.yml' },
    { name: 'Build Images', path: 'build-push-images.yml' },
];

function normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

const DeploymentsPanel: React.FC<DeploymentsPanelProps> = ({ githubToken, chatApiBaseUrl, modelsBaseDomain, showOnlyBackend = false, onBackendStatusChange, onActiveDeploymentsChange }) => {
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

        if (!showOnlyBackend) {
            fetchWorkflows().then(() => fetchLatestRuns());
        }
    }, [checkBackendHealth, refreshBackendStatus, fetchWorkflows, fetchLatestRuns, showOnlyBackend]);

    useEffect(() => {
        if (showOnlyBackend) return;

        const interval = setInterval(() => {
            if (!refreshInFlight.current) {
                fetchLatestRuns();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [fetchLatestRuns, showOnlyBackend]);



    return (
        <div className="space-y-2 pt-1">
            {/* Open App Row */}
            <div className="flex gap-2">
                <button
                    onClick={() => chrome.tabs.create({ url: 'http://localhost:8080' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1')
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-800/40 border-slate-700/30 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                >
                    <Terminal className="w-3.5 h-3.5" />
                    Open Local
                </button>
                <button
                    onClick={() => chrome.tabs.create({ url: 'https://chat.neevs.io' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${chatApiBaseUrl.includes('neevs.io')
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        : 'bg-slate-800/40 border-slate-700/30 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                >
                    <Globe className="w-3.5 h-3.5" />
                    Open Cloud
                </button>
            </div>

            {/* Server Row */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${backendHealth === 'ok' ? 'bg-emerald-400'
                        : backendHealth === 'down' ? 'bg-red-400'
                            : 'bg-blue-400 animate-pulse'
                        }`} />
                    <span className="text-xs text-slate-300">Server</span>
                    {backendProcess === 'running' && backendPid && (
                        <span className="text-[10px] text-slate-500">PID {backendPid}</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={fetchBackendLogs}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded transition-colors"
                        disabled={backendBusy}
                        title="Logs"
                    >
                        <Terminal className="w-3.5 h-3.5" />
                    </button>
                    {backendProcess !== 'running' ? (
                        <button
                            onClick={startBackend}
                            disabled={backendBusy || !(chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1'))}
                            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 rounded transition-all disabled:opacity-50"
                        >
                            <Power className="w-3 h-3" />
                            Start
                        </button>
                    ) : (
                        <button
                            onClick={stopBackend}
                            disabled={backendBusy}
                            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-red-300 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded transition-all"
                        >
                            <Power className="w-3 h-3" />
                            Stop
                        </button>
                    )}
                </div>
            </div>

            {/* Build Row */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                <span className="text-[10px] text-slate-500 mr-1">Build</span>
                <button
                    onClick={() => runBuild('playground')}
                    disabled={buildBusy}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 rounded transition-all disabled:opacity-50"
                >
                    <Package className="w-3 h-3 text-blue-400" />
                    Frontend
                </button>
                <button
                    onClick={() => runBuild('extension')}
                    disabled={buildBusy}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 rounded transition-all disabled:opacity-50"
                >
                    <Wrench className="w-3 h-3 text-purple-400" />
                    Extension
                </button>
                <button
                    onClick={() => runBuild('both')}
                    disabled={buildBusy}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 rounded transition-all disabled:opacity-50"
                >
                    <Zap className={`w-3 h-3 text-amber-400 ${buildBusy ? 'animate-pulse' : ''}`} />
                    All
                </button>
            </div>

            {/* Deploy Row */}
            {!showOnlyBackend && githubToken && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <span className="text-[10px] text-slate-500 mr-1">Deploy</span>
                    <button
                        onClick={() => triggerWorkflow('Chat')}
                        disabled={triggering === 'Chat' || loading}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 rounded transition-all disabled:opacity-50"
                    >
                        <Rocket className="w-3 h-3 text-emerald-400" />
                        Chat
                        {triggering === 'Chat' && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                    </button>
                    <button
                        onClick={() => triggerWorkflow('Build Images')}
                        disabled={triggering === 'Build Images' || loading}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 rounded transition-all disabled:opacity-50"
                    >
                        <RefreshCw className="w-3 h-3 text-purple-400" />
                        Images
                        {triggering === 'Build Images' && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                    </button>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="ml-auto p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded transition-colors"
                        title="Refresh workflow status"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            )}

            {/* Log Output */}
            {(backendLogTail || buildLogTail) && (
                <pre className="max-h-24 overflow-auto text-[9px] leading-relaxed bg-slate-950/60 border border-slate-700/30 rounded-lg p-2 text-slate-400 whitespace-pre-wrap font-mono">
                    {backendLogTail || buildLogTail}
                </pre>
            )}

            {/* Error Messages */}
            {(backendNativeError || buildNativeError || error) && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-[10px] text-amber-300">{backendNativeError || buildNativeError || error}</span>
                </div>
            )}

            {/* Workflow Status (compact dots) */}
            {!showOnlyBackend && githubToken && KEY_WORKFLOWS.length > 0 && (
                <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-slate-500">
                    {KEY_WORKFLOWS.map(kw => {
                        const run = runs.get(kw.name);
                        const isSuccess = run?.conclusion === 'success';
                        const isFailed = run?.conclusion === 'failure';
                        const isActive = run?.status === 'in_progress' || run?.status === 'queued';
                        return (
                            <div key={kw.name} className="flex items-center gap-1" title={`${kw.name}: ${run?.conclusion || run?.status || 'unknown'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-emerald-400'
                                    : isFailed ? 'bg-red-400'
                                        : isActive ? 'bg-blue-400 animate-pulse'
                                            : 'bg-slate-600'
                                    }`} />
                                <span>{kw.name}</span>
                                {run && (
                                    <a href={run.html_url} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">
                                        <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* No Token Warning */}
            {!showOnlyBackend && !githubToken && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/30 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] text-slate-400">Add GitHub token in Settings to enable Deploy</span>
                </div>
            )}
        </div>
    );
};

export default DeploymentsPanel;
