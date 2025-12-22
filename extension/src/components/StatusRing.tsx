import React from 'react';
import { RefreshCw, Activity } from 'lucide-react';

interface StatusRingProps {
    online: number;
    down: number;
    checking: number;
    deploying: number;
    total: number;
    loading: boolean;
    onRefresh: () => void;
}

/**
 * Visual health ring showing aggregate system status
 */
const StatusRing: React.FC<StatusRingProps> = ({
    online,
    down,
    checking,
    deploying,
    total,
    loading,
    onRefresh,
}) => {
    const healthPercent = total > 0 ? Math.round((online / total) * 100) : 0;

    // SVG ring calculations
    const size = 44;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (healthPercent / 100) * circumference;

    // Status ring color based on health
    const getRingColor = () => {
        if (healthPercent >= 80) return 'stroke-emerald-400';
        if (healthPercent >= 50) return 'stroke-amber-400';
        return 'stroke-red-400';
    };

    // Get status text
    const getStatusText = () => {
        if (loading) return 'Checking...';
        if (deploying > 0) return `${deploying} deploying`;
        if (down > 0) return `${down} down`;
        if (online === total) return 'All systems go';
        return `${online}/${total} online`;
    };

    return (
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-800/60 to-slate-800/40 backdrop-blur-sm rounded-2xl border border-slate-700/30 shadow-lg shadow-black/10">
            {/* Left: Ring + Stats */}
            <div className="flex items-center gap-4">
                {/* Health Ring */}
                <div className="relative">
                    <svg width={size} height={size} className="transform -rotate-90">
                        {/* Background ring */}
                        <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            className="stroke-slate-700/50"
                            fill="none"
                            strokeWidth={strokeWidth}
                        />
                        {/* Progress ring */}
                        <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            className={`${getRingColor()} transition-all duration-500 ease-out`}
                            fill="none"
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                        />
                    </svg>
                    {/* Center text */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-xs font-bold ${healthPercent >= 80 ? 'text-emerald-400' :
                            healthPercent >= 50 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                            {healthPercent}%
                        </span>
                    </div>
                </div>

                {/* Status Text */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-medium text-slate-300">
                            System Health
                        </span>
                    </div>
                    <span className="text-[13px] font-semibold text-white">
                        {getStatusText()}
                    </span>
                </div>
            </div>

            {/* Right: Stats Pills + Refresh */}
            <div className="flex items-center gap-2">
                {/* Compact stat pills */}
                <div className="flex items-center gap-1">
                    {online > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span className="text-[10px] font-medium text-emerald-400">{online}</span>
                        </span>
                    )}
                    {deploying > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                            <span className="text-[10px] font-medium text-blue-400">{deploying}</span>
                        </span>
                    )}
                    {checking > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-[10px] font-medium text-amber-400">{checking}</span>
                        </span>
                    )}
                    {down > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <span className="text-[10px] font-medium text-red-400">{down}</span>
                        </span>
                    )}
                </div>

                {/* Refresh button */}
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className={`
            p-2 rounded-xl transition-all duration-200
            ${loading
                            ? 'bg-slate-700/50 text-slate-500'
                            : 'bg-slate-700/30 text-slate-400 hover:text-white hover:bg-slate-600/50 active:scale-95'
                        }
          `}
                    title="Refresh all (R)"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>
        </div>
    );
};

export default StatusRing;
