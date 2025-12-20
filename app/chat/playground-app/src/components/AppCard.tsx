import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface AppCardProps {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'building' | 'deploying' | 'ok' | 'down' | 'checking';
  deploymentStatus?: 'success' | 'failure' | 'in_progress' | 'queued' | 'unknown';
  localStatus?: 'ok' | 'down' | 'checking';
  publicEndpoint: string;
  endpointUrl?: string;
  localEndpointUrl?: string;
  deploymentUrl?: string;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
}

const AppCard: React.FC<AppCardProps> = ({
  name,
  status,
  deploymentStatus,
  localStatus,
  publicEndpoint,
  endpointUrl,
  localEndpointUrl,
  deploymentUrl,
  children,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const getStatusText = () => {
    switch (status) {
      case 'running':
      case 'ok':
        return 'Available';
      case 'stopped':
        return 'Stopped';
      case 'down':
        return 'Down';
      case 'building':
        return 'Building';
      case 'deploying':
        return 'Deploying';
      case 'checking':
        return 'Checking';
      default:
        return 'Unknown';
    }
  };

  const statusBadge = endpointUrl ? (
    <a
      href={endpointUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium transition-all hover:opacity-80 ${
        status === 'running' || status === 'ok'
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          : status === 'stopped' || status === 'down'
          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
          : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      }`}
    >
      {getStatusText()}
    </a>
  ) : (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium ${
        status === 'running' || status === 'ok'
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          : status === 'stopped' || status === 'down'
          ? 'bg-red-500/20 text-red-300 border-red-500/30'
          : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      }`}
    >
      {getStatusText()}
    </span>
  );

  const getDeploymentLabel = () => {
    if (deploymentStatus === 'success') return 'Deployed';
    if (deploymentStatus === 'failure') return 'Failed';
    if (deploymentStatus === 'in_progress') return 'Deploying';
    if (deploymentStatus === 'queued') return 'Queued';
    return 'Deploy';
  };

  const getDeploymentClasses = () => {
    if (deploymentStatus === 'success') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    if (deploymentStatus === 'failure') return 'bg-red-500/20 text-red-300 border border-red-500/30';
    if (deploymentStatus === 'in_progress' || deploymentStatus === 'queued') return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    return 'bg-slate-800/40 text-slate-400 border border-slate-700/50';
  };

  const deploymentBadge =
    deploymentUrl && deploymentStatus && deploymentStatus !== 'unknown' ? (
      <a
        href={deploymentUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium transition-all hover:opacity-80 ${getDeploymentClasses()}`}
      >
        {getDeploymentLabel()}
      </a>
    ) : (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium ${getDeploymentClasses()}`}
      >
        {getDeploymentLabel()}
      </span>
    );

  const localBadge = localStatus
    ? localEndpointUrl ? (
        <a
          href={localEndpointUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium transition-all hover:opacity-80 border ${
            localStatus === 'ok'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : localStatus === 'down'
              ? 'bg-red-500/20 text-red-300 border-red-500/30'
              : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
          }`}
        >
          Local
        </a>
      ) : (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium border ${
            localStatus === 'ok'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : localStatus === 'down'
              ? 'bg-red-500/20 text-red-300 border-red-500/30'
              : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
          }`}
        >
          Local
        </span>
      )
    : (
      <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium border border-slate-700/50 bg-slate-800/40 text-slate-500">
        Local
      </span>
    );

  const renderSeparator = () => (
    <span className="text-slate-600 text-[10px]">→</span>
  );

  return (
    <div className="rounded-lg bg-slate-800/40 border border-slate-700/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-sm font-medium text-slate-200">{name}</span>
          <span className="text-[10px] text-slate-500 truncate max-w-full">{publicEndpoint}</span>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {/* Expanded Content */}
      {expanded && children && (
        <div className="border-t border-slate-700/30 p-3">
          {children}
        </div>
      )}

      {/* Footer with Status Badges */}
      <div className="border-t border-slate-700/30 px-3 py-2 bg-slate-900/40 flex items-center gap-2">
        {/* Local → Web Status → Deployment */}
        {localBadge}
        {localBadge && (statusBadge || deploymentBadge) && renderSeparator()}
        {statusBadge}
        {statusBadge && deploymentBadge && renderSeparator()}
        {deploymentBadge}
      </div>
    </div>
  );
};

export default AppCard;
