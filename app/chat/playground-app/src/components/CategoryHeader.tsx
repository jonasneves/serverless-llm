import React from 'react';
import {
    ChevronDown,
    ChevronRight,
    Zap,
    Server,
    Cpu,
    Brain,
    Sparkles
} from 'lucide-react';

interface CategoryHeaderProps {
    id: string;
    name: string;
    onlineCount: number;
    totalCount: number;
    isCollapsed: boolean;
    onToggle: () => void;
    showDeployAll?: boolean;
    onDeployAll?: () => void;
    isDeploying?: boolean;
}

// Category icons and colors
const CATEGORY_STYLES: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
    core: {
        icon: Server,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
    },
    small: {
        icon: Sparkles,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
    },
    medium: {
        icon: Cpu,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
    },
    reasoning: {
        icon: Brain,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
    },
};

const CategoryHeader: React.FC<CategoryHeaderProps> = ({
    id,
    name,
    onlineCount,
    totalCount,
    isCollapsed,
    onToggle,
    showDeployAll,
    onDeployAll,
    isDeploying,
}) => {
    const style = CATEGORY_STYLES[id] || CATEGORY_STYLES.core;
    const Icon = style.icon;
    const allOnline = onlineCount === totalCount;

    return (
        <div className="flex items-center justify-between py-2">
            {/* Left: Collapse toggle + Category info */}
            <button
                onClick={onToggle}
                className="flex items-center gap-2 group"
            >
                {/* Chevron */}
                <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
                    {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                    )}
                </span>

                {/* Icon Badge */}
                <span className={`p-1.5 rounded-lg ${style.bgColor}`}>
                    <Icon className={`w-3.5 h-3.5 ${style.color}`} />
                </span>

                {/* Name */}
                <span className="text-[12px] font-semibold text-slate-200 group-hover:text-white transition-colors">
                    {name}
                </span>

                {/* Online Count */}
                <span className={`
          text-[10px] font-medium px-1.5 py-0.5 rounded-full
          ${allOnline
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : onlineCount > 0
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-red-500/15 text-red-400'
                    }
        `}>
                    {onlineCount}/{totalCount}
                </span>
            </button>

            {/* Right: Deploy All button */}
            {showDeployAll && !isCollapsed && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeployAll?.();
                    }}
                    disabled={isDeploying}
                    className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium
            transition-all duration-200
            ${isDeploying
                            ? 'bg-blue-500/20 text-blue-400 cursor-wait'
                            : 'bg-slate-700/30 text-slate-400 hover:text-white hover:bg-slate-600/50 active:scale-95'
                        }
          `}
                >
                    <Zap className={`w-3 h-3 ${isDeploying ? 'animate-pulse' : ''}`} />
                    <span>{isDeploying ? 'Deploying...' : 'Deploy All'}</span>
                </button>
            )}
        </div>
    );
};

export default CategoryHeader;
