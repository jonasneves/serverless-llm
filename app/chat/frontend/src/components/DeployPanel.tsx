import React from 'react';
import { Rocket, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

interface WorkflowRun {
  id: number;
  name: string;
  status: 'completed' | 'in_progress' | 'queued' | 'waiting' | 'failure';
  conclusion: 'success' | 'failure' | 'cancelled' | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface DeployPanelProps {
  appId: string;
  githubToken: string;
  runs: Map<string, WorkflowRun | null>;
  triggering: string | null;
  loading: boolean;
  onDeploy: (workflowName: string) => void;
  onRefresh: () => void;
}

const DeployPanel: React.FC<DeployPanelProps> = ({
  appId,
  githubToken,
  runs,
  triggering,
  loading,
  onDeploy,
  onRefresh,
}) => {
  if (!githubToken) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-[10px] text-amber-300">Add GitHub token in Settings to enable Deploy</span>
      </div>
    );
  }

  const getWorkflowForApp = () => {
    if (appId === 'chat-api') return 'Chat';
    if (appId === 'qwen') return 'Qwen';
    if (appId === 'phi') return 'Phi';
    if (appId === 'llama') return 'Llama';
    if (appId === 'mistral') return 'Mistral';
    if (appId === 'gemma') return 'Gemma';
    if (appId === 'r1qwen') return 'R1 Qwen';
    if (appId === 'rnj') return 'RNJ';
    return null;
  };

  const workflowName = getWorkflowForApp();

  if (!workflowName) {
    return (
      <div className="text-[10px] text-slate-500 py-2">
        No deployment workflows available for this app
      </div>
    );
  }

  const run = runs.get(workflowName);
  const isSuccess = run?.conclusion === 'success';
  const isFailed = run?.conclusion === 'failure';
  const isActive = run?.status === 'in_progress' || run?.status === 'queued';

  return (
    <div className="space-y-2">
      <button
        onClick={() => onDeploy(workflowName)}
        disabled={triggering === workflowName || loading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Rocket className="w-3.5 h-3.5" />
        <span>Deploy to Cloud</span>
        {triggering === workflowName && <RefreshCw className="w-3 h-3 animate-spin" />}
      </button>

      {run && (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/40 border border-slate-700/30 rounded-lg">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${
              isSuccess ? 'bg-emerald-400'
              : isFailed ? 'bg-red-400'
              : isActive ? 'bg-blue-400 animate-pulse'
              : 'bg-slate-600'
            }`} />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400">Last deployment</span>
              <span className={`text-xs font-medium ${
                isSuccess ? 'text-emerald-400'
                : isFailed ? 'text-red-400'
                : isActive ? 'text-blue-400'
                : 'text-slate-500'
              }`}>
                {run.conclusion || run.status}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={run.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded transition-colors"
              title="View on GitHub"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-50"
              title="Refresh status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeployPanel;
