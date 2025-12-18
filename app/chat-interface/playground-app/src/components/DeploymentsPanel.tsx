import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Rocket, RefreshCw, CheckCircle, XCircle, Clock, Play, ExternalLink, AlertCircle, WifiOff } from 'lucide-react';

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
}

const REPO_OWNER = 'jonasneves';
const REPO_NAME = 'serverless-llm';

// Key workflows to monitor
const KEY_WORKFLOWS = [
    { name: 'Chat', path: 'chat-interface.yml' },
    { name: 'Build Images', path: 'build-push-images.yml' },
];

function normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

function getHostLabel(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

const DeploymentsPanel: React.FC<DeploymentsPanelProps> = ({ githubToken, chatApiBaseUrl, modelsBaseDomain, showOnlyBackend = false, onBackendStatusChange }) => {
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
    const [backendMode, setBackendMode] = useState<string | null>(null);
    const refreshInFlight = useRef(false);
    const workflowsRef = useRef<Map<string, WorkflowInfo>>(new Map());

    const headers = {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };

    const checkBackendHealth = useCallback(async () => {
        setBackendHealth('checking');
        try {
            // Use /health endpoint (not /api/health)
            const baseUrl = normalizeBaseUrl(chatApiBaseUrl) || 'http://localhost:8080';
            const response = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                signal: AbortSignal.timeout(5000),
            });
            setBackendHealth(response.ok ? 'ok' : 'down');
        } catch (err) {
            console.log('Health check failed:', err);
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
            setBackendMode(mode);
            setBackendNativeError(null);
            onBackendStatusChange?.({ process, mode });
            return;
        }
        setBackendNativeError(resp?.error || null);
        setBackendProcess('unknown');
        setBackendPid(null);
        setBackendMode(null);
        onBackendStatusChange?.({ process: 'unknown', mode: null });
    }, [chatApiBaseUrl, onBackendStatusChange]);

    const startBackend = async () => {
        setBackendBusy(true);
        setBackendLogTail(null);
        setBackendNativeError(null);

        const isLocalChat = chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1');
        if (!isLocalChat) {
            setBackendNativeError('Backend start only works with local chat API (localhost:8080)');
            setBackendBusy(false);
            return;
        }

        const mode = modelsBaseDomain ? 'dev-remote' : 'dev-interface-local';
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

    const fetchWorkflows = useCallback(async () => {
        if (!githubToken) {
            setError('GitHub token required');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch(
                `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows`,
                { headers, signal: AbortSignal.timeout(8000) }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = await response.json();
            const workflowMap = new Map<string, WorkflowInfo>();

            for (const workflow of data.workflows) {
                const keyWorkflow = KEY_WORKFLOWS.find(kw => workflow.path.endsWith(kw.path));
                if (keyWorkflow) {
                    workflowMap.set(keyWorkflow.name, {
                        id: workflow.id,
                        name: keyWorkflow.name,
                        path: workflow.path,
                    });
                }
            }

            workflowsRef.current = workflowMap;
            setWorkflows(workflowMap);
            return workflowMap;
        } catch (err: any) {
            setError(err.message);
            return null;
        }
    }, [githubToken]);

    const fetchLatestRuns = useCallback(async (workflowMap?: Map<string, WorkflowInfo>) => {
        const wf = workflowMap || workflowsRef.current;
        if (wf.size === 0) return;

        const runsMap = new Map<string, WorkflowRun | null>();

        await Promise.all(
            Array.from(wf.entries()).map(async ([name, workflow]) => {
                try {
                    const response = await fetch(
                        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflow.id}/runs?per_page=1`,
                        { headers, signal: AbortSignal.timeout(8000) }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        if (data.workflow_runs && data.workflow_runs.length > 0) {
                            const run = data.workflow_runs[0];
                            runsMap.set(name, {
                                id: run.id,
                                name: run.name,
                                status: run.status,
                                conclusion: run.conclusion,
                                created_at: run.created_at,
                                updated_at: run.updated_at,
                                html_url: run.html_url,
                            });
                        } else {
                            runsMap.set(name, null);
                        }
                    }
                } catch {
                    runsMap.set(name, null);
                }
            })
        );

        setRuns(runsMap);
        setLoading(false);
    }, [githubToken]);

    const triggerWorkflow = async (name: string) => {
        const workflow = workflowsRef.current.get(name) || workflows.get(name);
        if (!workflow || !githubToken) return;

        setTriggering(name);
        try {
            const response = await fetch(
                `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflow.id}/dispatches`,
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ref: 'main',
                        // For Build Images, include parameters
                        ...(name === 'Build Images' && {
                            inputs: {
                                models: 'chat-interface',
                            },
                        }),
                    }),
                    signal: AbortSignal.timeout(8000),
                }
            );

            if (!response.ok && response.status !== 204) {
                throw new Error(`Failed to trigger: ${response.status}`);
            }

            // Wait a bit then refresh
            setTimeout(() => {
                fetchLatestRuns();
                setTriggering(null);
            }, 2000);
        } catch (err: any) {
            console.error('Failed to trigger workflow:', err);
            setTriggering(null);
        }
    };

    const refresh = useCallback(async () => {
        if (refreshInFlight.current) return;
        refreshInFlight.current = true;
        setLoading(true);
        setError(null);
        try {
            const wf = await fetchWorkflows();
            if (wf) {
                await fetchLatestRuns(wf);
            }
            await Promise.all([checkBackendHealth(), refreshBackendStatus()]);
        } finally {
            refreshInFlight.current = false;
            setLoading(false);
        }
    }, [fetchWorkflows, fetchLatestRuns, checkBackendHealth, refreshBackendStatus]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [githubToken, chatApiBaseUrl]);

    const getStatusIcon = (run: WorkflowRun | null) => {
        if (!run) return <Clock className="w-4 h-4 text-gray-400" />;
        if (run.status === 'in_progress' || run.status === 'queued') {
            return <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />;
        }
        if (run.conclusion === 'success') {
            return <CheckCircle className="w-4 h-4 text-green-500" />;
        }
        if (run.conclusion === 'failure') {
            return <XCircle className="w-4 h-4 text-red-500" />;
        }
        return <Clock className="w-4 h-4 text-gray-400" />;
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString();
    };

    if (!githubToken) {
        return (
            <div className="p-4 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Configure GitHub token in Settings to use deployments</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Backend Health */}
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {backendHealth === 'ok' && <CheckCircle className="w-4 h-4 text-green-500" />}
                        {backendHealth === 'down' && <XCircle className="w-4 h-4 text-red-500" />}
                        {backendHealth === 'checking' && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
                        <span className="text-sm text-slate-300">Backend</span>
                    </div>
                    <span className="text-xs text-slate-500 truncate">{getHostLabel(normalizeBaseUrl(chatApiBaseUrl) || 'http://localhost:8080')}</span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                        {backendProcess === 'running' && backendPid ? (
                            <span>
                                Process: running (pid {backendPid})
                                {backendMode && <span className="text-slate-600"> | {backendMode}</span>}
                            </span>
                        ) : (
                            `Process: ${backendProcess}`
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchBackendLogs}
                            className="text-xs text-slate-400 hover:text-white transition-colors"
                            disabled={backendBusy}
                        >
                            Logs
                        </button>
                        {backendProcess !== 'running' ? (
                            <button
                                onClick={startBackend}
                                disabled={backendBusy || !(chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1'))}
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                    chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1')
                                        ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                                        : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                                }`}
                                title={
                                    chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1')
                                        ? modelsBaseDomain ? 'Start with remote models' : 'Start with local models'
                                        : 'Backend start only available for localhost'
                                }
                            >
                                {modelsBaseDomain ? 'Start (remote)' : 'Start (local)'}
                            </button>
                        ) : (
                            <button
                                onClick={stopBackend}
                                disabled={backendBusy}
                                className="px-2 py-1 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                            >
                                Stop
                            </button>
                        )}
                    </div>
                </div>

                {backendLogTail && (
                    <pre className="mt-2 max-h-40 overflow-auto text-[10px] leading-snug bg-slate-950/40 border border-slate-700/40 rounded p-2 text-slate-300 whitespace-pre-wrap">
                        {backendLogTail}
                    </pre>
                )}

                {backendNativeError && (
                    <div className="mt-2 text-[11px] text-amber-300/90">
                        Native host: {backendNativeError}
                    </div>
                )}

                {showOnlyBackend && backendProcess === 'stopped' && !backendBusy && (
                    <div className="mt-3 p-4 text-center bg-slate-900/50 rounded border border-slate-700/30">
                        <WifiOff className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <p className="text-sm text-slate-400 mb-1">Backend is stopped</p>
                        <p className="text-xs text-slate-500">Click Start to launch the local chat server</p>
                    </div>
                )}
            </div>

            {!showOnlyBackend && error && (
                <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-xs">
                    {error}
                </div>
            )}

            {!showOnlyBackend && (
                <>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                            <Rocket className="w-4 h-4" />
                            Deployments
                        </h2>
                        <button
                            onClick={refresh}
                            disabled={loading}
                            className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                        >
                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>

                    {/* Workflows */}
            <div className="space-y-2">
                {KEY_WORKFLOWS.map(kw => {
                    const run = runs.get(kw.name);
                    const isTriggering = triggering === kw.name;

                    return (
                        <div
                            key={kw.name}
                            className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    {getStatusIcon(run ?? null)}
                                    <span className="text-sm font-medium text-slate-200">{kw.name}</span>
                                </div>
                                {run && (
                                    <a
                                        href={run.html_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-400 hover:text-white transition-colors"
                                        title="View on GitHub"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500">
                                    {run ? formatTime(run.updated_at) : 'No runs'}
                                </span>
                                <button
                                    onClick={() => triggerWorkflow(kw.name)}
                                    disabled={isTriggering || loading}
                                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${isTriggering
                                        ? 'bg-slate-700 text-slate-400'
                                        : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                                        }`}
                                >
                                    {isTriggering ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <Play className="w-3 h-3" />
                                    )}
                                    {isTriggering ? 'Triggering...' : 'Deploy'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div className="pt-3 border-t border-slate-700/50">
                <p className="text-xs text-slate-500 mb-2">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => triggerWorkflow('Chat')}
                        disabled={triggering === 'Chat' || loading}
                        className="px-3 py-2 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors"
                    >
                        🚀 Redeploy Chat
                    </button>
                    <button
                        onClick={() => triggerWorkflow('Build Images')}
                        disabled={triggering === 'Build Images' || loading}
                        className="px-3 py-2 text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 rounded transition-colors"
                    >
                        🔨 Rebuild Images
                    </button>
                </div>
            </div>
                </>
            )}
        </div>
    );
};

export default DeploymentsPanel;
