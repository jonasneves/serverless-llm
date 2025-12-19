import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Rocket, RefreshCw, CheckCircle, XCircle, Clock, Play, ExternalLink, AlertCircle, WifiOff, Power, Terminal, Zap } from 'lucide-react';

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
    const [backendMode, setBackendMode] = useState<string | null>(null);
    const [buildBusy, setBuildBusy] = useState(false);
    const [buildLogTail, setBuildLogTail] = useState<string | null>(null);
    const [buildNativeError, setBuildNativeError] = useState<string | null>(null);
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

    const buildPlayground = async () => {
        setBuildBusy(true);
        setBuildLogTail(null);
        setBuildNativeError(null);

        const resp = await nativeRequest({ action: 'make', target: 'build-playground' });
        if (resp?.logTail) setBuildLogTail(resp.logTail);
        if (!resp?.ok && resp?.error) setBuildNativeError(resp.error);
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

        // Count active deployments
        if (onActiveDeploymentsChange) {
            const activeCount = Array.from(runsMap.values()).filter(
                run => run && (run.status === 'in_progress' || run.status === 'queued')
            ).length;
            onActiveDeploymentsChange(activeCount);
        }
    }, [githubToken, onActiveDeploymentsChange]);

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
            if (!showOnlyBackend) {
                const wf = await fetchWorkflows();
                if (wf) {
                    await fetchLatestRuns(wf);
                }
            }
            await Promise.all([checkBackendHealth(), refreshBackendStatus()]);
        } finally {
            refreshInFlight.current = false;
            setLoading(false);
        }
    }, [fetchWorkflows, fetchLatestRuns, checkBackendHealth, refreshBackendStatus, showOnlyBackend]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [refresh]);

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

    if (!githubToken && !showOnlyBackend) {
        return (
            <div className="mt-2 p-6 text-center rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-800/40 border border-slate-700/30">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/20">
                    <AlertCircle className="w-7 h-7 text-amber-400" />
                </div>
                <p className="text-sm font-medium text-slate-200 mb-1">GitHub Token Required</p>
                <p className="text-xs text-slate-500 mb-4">Configure your GitHub token in Settings to enable deployments</p>
                <a
                    href="https://github.com/settings/tokens/new?description=Serverless+LLM+Extension&scopes=repo,workflow&default_expires_at=none"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-colors"
                >
                    Create Token
                    <ExternalLink className="w-3 h-3" />
                </a>
            </div>
        );
    }

    return (
        <div className="space-y-4 pt-2">
            {/* Backend Health - Premium Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-800/40 backdrop-blur-sm border border-slate-700/30 shadow-xl shadow-black/10">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            backendHealth === 'ok' 
                                ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]' 
                                : backendHealth === 'down' 
                                    ? 'bg-red-500/20 text-red-400' 
                                    : 'bg-blue-500/20 text-blue-400'
                        }`}>
                            {backendHealth === 'ok' && <CheckCircle className="w-5 h-5" />}
                            {backendHealth === 'down' && <XCircle className="w-5 h-5" />}
                            {backendHealth === 'checking' && <RefreshCw className="w-5 h-5 animate-spin" />}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Backend Server</p>
                            <p className="text-[11px] text-slate-400">
                                {backendHealth === 'ok' ? 'Running & healthy' : backendHealth === 'down' ? 'Not responding' : 'Checking...'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => chrome.tabs.create({ url: normalizeBaseUrl(chatApiBaseUrl) || 'http://localhost:8080' })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 rounded-lg transition-all"
                        title="Open chat (⌘/Ctrl+O)"
                    >
                        <span className="truncate max-w-[80px]">{getHostLabel(normalizeBaseUrl(chatApiBaseUrl) || 'http://localhost:8080')}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </button>
                </div>

                {/* Process Status Bar */}
                <div className="flex items-center justify-between p-2.5 bg-slate-900/50 rounded-xl">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Terminal className="w-3.5 h-3.5" />
                        {backendProcess === 'running' && backendPid ? (
                            <span className="flex items-center gap-2">
                                <span className="text-emerald-400">Running</span>
                                <span className="text-slate-500">PID {backendPid}</span>
                                {backendMode && <span className="px-1.5 py-0.5 text-[10px] bg-slate-700/50 text-slate-300 rounded">{backendMode}</span>}
                            </span>
                        ) : (
                            <span className={backendProcess === 'stopped' ? 'text-slate-500' : 'text-slate-400'}>{backendProcess}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchBackendLogs}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                            disabled={backendBusy}
                        >
                            <Terminal className="w-3 h-3" />
                            Logs
                        </button>
                        <button
                            onClick={buildPlayground}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                            disabled={backendBusy || buildBusy}
                            title="Run make build-playground"
                        >
                            <Zap className={`w-3 h-3 ${buildBusy ? 'animate-pulse' : ''}`} />
                            Build
                        </button>
                        {backendProcess !== 'running' ? (
                            <button
                                onClick={startBackend}
                                disabled={backendBusy || !(chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1'))}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                    chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1')
                                        ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 text-emerald-300 hover:from-emerald-500/30 hover:to-emerald-600/30 border border-emerald-500/20'
                                        : 'bg-slate-700/30 text-slate-500 cursor-not-allowed'
                                }`}
                                title={
                                    chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1')
                                        ? modelsBaseDomain ? 'Start with remote models' : 'Start with local models'
                                        : 'Backend start only available for localhost'
                                }
                            >
                                <Power className="w-3 h-3" />
                                {modelsBaseDomain ? 'Start (remote)' : 'Start (local)'}
                            </button>
                        ) : (
                            <button
                                onClick={stopBackend}
                                disabled={backendBusy}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all"
                            >
                                <Power className="w-3 h-3" />
                                Stop
                            </button>
                        )}
                    </div>
                </div>

                {/* Log Output */}
                {backendLogTail && (
                    <pre className="mt-3 max-h-32 overflow-auto text-[10px] leading-relaxed bg-slate-950/60 border border-slate-700/30 rounded-xl p-3 text-slate-300 whitespace-pre-wrap font-mono">
                        {backendLogTail}
                    </pre>
                )}

                {buildLogTail && (
                    <pre className="mt-3 max-h-32 overflow-auto text-[10px] leading-relaxed bg-slate-950/60 border border-slate-700/30 rounded-xl p-3 text-slate-300 whitespace-pre-wrap font-mono">
                        {buildLogTail}
                    </pre>
                )}

                {/* Error Message */}
                {backendNativeError && (
                    <div className="mt-3 flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-[11px] text-amber-300/90">Native host: {backendNativeError}</span>
                    </div>
                )}

                {buildNativeError && (
                    <div className="mt-3 flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-[11px] text-amber-300/90">Build: {buildNativeError}</span>
                    </div>
                )}

                {/* Empty State */}
                {showOnlyBackend && backendProcess === 'stopped' && !backendBusy && (
                    <div className="mt-4 p-6 text-center rounded-xl bg-slate-900/40 border border-slate-700/20">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-800/60 flex items-center justify-center">
                            <WifiOff className="w-6 h-6 text-slate-500" />
                        </div>
                        <p className="text-sm font-medium text-slate-300 mb-1">Backend is stopped</p>
                        <p className="text-xs text-slate-500">Click Start to launch the local chat server</p>
                    </div>
                )}
            </div>

            {!showOnlyBackend && error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-300">{error}</span>
                </div>
            )}

            {!showOnlyBackend && (
                <>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Rocket className="w-4 h-4 text-purple-400" />
                            Deployments
                        </h2>
                        <button
                            onClick={refresh}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>

                    {/* Workflows - Premium Cards */}
                    <div className="space-y-3">
                        {KEY_WORKFLOWS.map(kw => {
                            const run = runs.get(kw.name);
                            const isTriggering = triggering === kw.name;
                            const isActive = run?.status === 'in_progress' || run?.status === 'queued';

                            return (
                                <div
                                    key={kw.name}
                                    className={`p-4 rounded-xl bg-slate-800/40 backdrop-blur-sm border transition-all ${
                                        isActive 
                                            ? 'border-blue-500/30 shadow-lg shadow-blue-500/5' 
                                            : 'border-slate-700/30 hover:border-slate-600/40'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                run?.conclusion === 'success' 
                                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                                    : run?.conclusion === 'failure' 
                                                        ? 'bg-red-500/20 text-red-400' 
                                                        : isActive 
                                                            ? 'bg-blue-500/20 text-blue-400' 
                                                            : 'bg-slate-700/50 text-slate-400'
                                            }`}>
                                                {getStatusIcon(run ?? null)}
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-white">{kw.name}</span>
                                                <p className="text-[11px] text-slate-500">
                                                    {run ? formatTime(run.updated_at) : 'No runs'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {run && (
                                                <a
                                                    href={run.html_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                                                    title="View on GitHub"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => triggerWorkflow(kw.name)}
                                                disabled={isTriggering || loading}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                                    isTriggering
                                                        ? 'bg-slate-700/50 text-slate-400'
                                                        : 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 hover:from-blue-500/30 hover:to-purple-500/30 border border-blue-500/20'
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
                                </div>
                            );
                        })}
                    </div>

                    {/* Quick Actions - Premium Style */}
                    <div className="pt-4 mt-4 border-t border-slate-700/30">
                        <p className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-2">
                            <Zap className="w-3 h-3" />
                            Quick Actions
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => triggerWorkflow('Chat')}
                                disabled={triggering === 'Chat' || loading}
                                className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 text-emerald-300 hover:from-emerald-500/20 hover:to-emerald-600/20 rounded-xl border border-emerald-500/20 transition-all active:scale-[0.98]"
                            >
                                <Rocket className="w-3.5 h-3.5" />
                                Redeploy Chat
                            </button>
                            <button
                                onClick={() => triggerWorkflow('Build Images')}
                                disabled={triggering === 'Build Images' || loading}
                                className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium bg-gradient-to-br from-purple-500/10 to-purple-600/10 text-purple-300 hover:from-purple-500/20 hover:to-purple-600/20 rounded-xl border border-purple-500/20 transition-all active:scale-[0.98]"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Rebuild Images
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default DeploymentsPanel;
