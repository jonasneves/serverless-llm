import React, { useState } from 'react';
import { ChevronRight, ExternalLink, Loader2 } from 'lucide-react';

interface AppCardProps {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'building' | 'deploying' | 'ok' | 'down' | 'checking';
  deploymentStatus?: 'success' | 'failure' | 'in_progress' | 'queued' | 'unknown';
  localStatus?: 'ok' | 'down' | 'checking';
  latency?: number;
  publicEndpoint: string;
  endpointUrl?: string;
  localEndpointUrl?: string;
  deploymentUrl?: string;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
}

const formatLatency = (latency?: number) => {
  if (!latency) return null;
  if (latency < 1000) return `${latency}ms`;
  return `${(latency / 1000).toFixed(1)}s`;
};

const getLatencyColor = (latency?: number) => {
  if (!latency) return 'text-slate-500';
  if (latency < 500) return 'text-emerald-400';
  if (latency < 1500) return 'text-amber-400';
  return 'text-red-400';
};

// Status dot with pulse for deploying
const StatusDot: React.FC<{
  status: 'ok' | 'down' | 'checking' | 'deploying' | 'running' | 'stopped' | 'building';
  size?: 'sm' | 'md';
  pulse?: boolean;
}> = ({ status, size = 'sm', pulse }) => {
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  const colorClasses = {
    ok: 'bg-emerald-400',
    running: 'bg-emerald-400',
    down: 'bg-red-400',
    stopped: 'bg-red-400',
    checking: 'bg-amber-400',
    building: 'bg-amber-400',
    deploying: 'bg-blue-400',
  }[status] || 'bg-slate-400';

  const shouldPulse = pulse || status === 'checking' || status === 'deploying' || status === 'building';

  return (
    <span className="relative flex">
      <span className={`${sizeClasses} rounded-full ${colorClasses}`} />
      {shouldPulse && (
        <span className={`absolute inset-0 ${sizeClasses} rounded-full ${colorClasses} animate-ping opacity-75`} />
      )}
    </span>
  );
};

const AppCard: React.FC<AppCardProps> = ({
  name,
  status,
  deploymentStatus,
  localStatus,
  latency,
  publicEndpoint,
  endpointUrl,
  localEndpointUrl,
  deploymentUrl,
  children,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isDeploying = deploymentStatus === 'in_progress' || deploymentStatus === 'queued';
  const isHealthy = status === 'running' || status === 'ok';
  const isDown = status === 'stopped' || status === 'down';

  // Get accent color based on status
  const getAccentClass = () => {
    if (isDeploying) return 'border-l-blue-500';
    if (isHealthy) return 'border-l-emerald-500';
    if (isDown) return 'border-l-red-400';
    return 'border-l-amber-400';
  };

  return (
    <div
      className={`
        rounded-xl bg-slate-800/40 border border-slate-700/30 overflow-hidden
        border-l-2 ${getAccentClass()}
        transition-all duration-200 ease-out
        hover:bg-slate-800/60 hover:border-slate-600/40
        ${isDeploying ? 'ring-1 ring-blue-500/20' : ''}
      `}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors group"
      >
        {/* Status Indicator */}
        <div className="relative flex-shrink-0">
          {isDeploying ? (
            <div className="relative">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            </div>
          ) : (
            <StatusDot status={status} size="md" />
          )}
        </div>

        {/* Name & Endpoint */}
        <div className="flex flex-col items-start min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-100 group-hover:text-white transition-colors">
              {name}
            </span>
            {latency && isHealthy && (
              <span className={`text-[10px] font-mono tabular-nums ${getLatencyColor(latency)}`}>
                {formatLatency(latency)}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 truncate max-w-full">
            {publicEndpoint}
          </span>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {endpointUrl && (
            <a
              href={endpointUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Open endpoint"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Expand Chevron */}
        <ChevronRight
          className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''
            }`}
        />
      </button>

      {/* Expanded Content */}
      <div className={`
        overflow-hidden transition-all duration-200 ease-out
        ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        {children && (
          <div className="border-t border-slate-700/30 p-3">
            {children}
          </div>
        )}
      </div>

      {/* Compact Footer Status */}
      <div className="border-t border-slate-700/30 px-3 py-2 bg-slate-900/40">
        <div className="flex items-center gap-3 text-[10px]">
          {/* Self-hosted Status */}
          <div className="flex items-center gap-1.5" title={localEndpointUrl || 'Self-hosted endpoint'}>
            <StatusDot status={localStatus || 'down'} size="sm" />
            <span className="text-slate-500">Self-hosted</span>
          </div>

          <span className="text-slate-700">•</span>

          {/* Public Status */}
          <div className="flex items-center gap-1.5" title={endpointUrl || publicEndpoint}>
            <StatusDot status={status} size="sm" />
            <span className="text-slate-500">Public</span>
          </div>

          <span className="text-slate-700">•</span>

          {/* Deploy Status */}
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            title="View deployment"
          >
            <StatusDot
              status={
                deploymentStatus === 'success' ? 'ok' :
                  deploymentStatus === 'failure' ? 'down' :
                    deploymentStatus === 'in_progress' ? 'deploying' :
                      'checking'
              }
              size="sm"
              pulse={isDeploying}
            />
            <span className="text-slate-500">
              {isDeploying ? 'Deploying' : 'Deploy'}
            </span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default AppCard;
