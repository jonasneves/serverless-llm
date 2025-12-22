import React from 'react';
import { Power, Terminal, AlertCircle, Activity } from 'lucide-react';

interface ObservePanelProps {
  appId: string;
  backendHealth: 'ok' | 'down' | 'checking';
  backendProcess: 'running' | 'stopped' | 'unknown';
  backendPid: number | null;
  backendBusy: boolean;
  backendLogTail: string | null;
  backendNativeError: string | null;
  chatApiBaseUrl: string;
  onStart: () => void;
  onStop: () => void;
  onFetchLogs: () => void;
}

const ObservePanel: React.FC<ObservePanelProps> = ({
  appId,
  backendHealth,
  backendProcess,
  backendPid,
  backendBusy,
  backendLogTail,
  backendNativeError,
  chatApiBaseUrl,
  onStart,
  onStop,
  onFetchLogs,
}) => {
  const isModelApp = ['qwen', 'phi', 'llama', 'mistral', 'gemma', 'r1qwen', 'rnj'].includes(appId);

  if (!isModelApp && appId !== 'chat-api') {
    return (
      <div className="text-[10px] text-slate-500 py-2">
        No observability available for this app
      </div>
    );
  }

  const isLocalChat = chatApiBaseUrl.includes('localhost') || chatApiBaseUrl.includes('127.0.0.1');

  // For model apps, show simplified health-only view
  if (isModelApp) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/40 border border-slate-700/30 rounded-lg">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              backendHealth === 'ok' ? 'bg-emerald-400'
              : backendHealth === 'down' ? 'bg-red-400'
              : 'bg-blue-400 animate-pulse'
            }`} />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500">Health</span>
              <span className={`text-xs font-medium ${
                backendHealth === 'ok' ? 'text-emerald-400'
                : backendHealth === 'down' ? 'text-red-400'
                : 'text-blue-400'
              }`}>
                {backendHealth === 'ok' ? 'Healthy' : backendHealth === 'down' ? 'Down' : 'Checking'}
              </span>
            </div>
          </div>
        </div>
        <div className="text-[10px] text-slate-500 px-3 py-2">
          Model inference endpoint monitoring
        </div>
      </div>
    );
  }

  // Chat API gets full controls
  return (
    <div className="space-y-2">
      {/* Health Status */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/40 border border-slate-700/30 rounded-lg">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            backendHealth === 'ok' ? 'bg-emerald-400'
            : backendHealth === 'down' ? 'bg-red-400'
            : 'bg-blue-400 animate-pulse'
          }`} />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500">Health</span>
            <span className={`text-xs font-medium ${
              backendHealth === 'ok' ? 'text-emerald-400'
              : backendHealth === 'down' ? 'text-red-400'
              : 'text-blue-400'
            }`}>
              {backendHealth === 'ok' ? 'Healthy' : backendHealth === 'down' ? 'Down' : 'Checking'}
            </span>
          </div>
        </div>
        {backendProcess === 'running' && backendPid && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Activity className="w-3 h-3" />
            <span>PID {backendPid}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {backendProcess !== 'running' ? (
          <button
            onClick={onStart}
            disabled={backendBusy || !isLocalChat}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Start Server</span>
          </button>
        ) : (
          <button
            onClick={onStop}
            disabled={backendBusy}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-300 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Stop Server</span>
          </button>
        )}
        <button
          onClick={onFetchLogs}
          disabled={backendBusy}
          className="px-3 py-2 text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="View Logs"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Logs */}
      {backendLogTail && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <Terminal className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] text-slate-500 font-medium">Logs</span>
          </div>
          <pre className="max-h-32 overflow-auto text-[9px] leading-relaxed bg-slate-950/60 border border-slate-700/30 rounded-lg p-2 text-slate-400 whitespace-pre-wrap font-mono">
            {backendLogTail}
          </pre>
        </div>
      )}

      {/* Error */}
      {backendNativeError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-amber-300">{backendNativeError}</span>
        </div>
      )}

      {!isLocalChat && backendProcess !== 'running' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-[10px] text-blue-300">Server control only available for localhost</span>
        </div>
      )}
    </div>
  );
};

export default ObservePanel;
