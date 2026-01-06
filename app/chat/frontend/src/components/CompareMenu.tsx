import { useRef, useMemo } from 'react';
import { Search, Plus, X, Check } from 'lucide-react';
import { Model } from '../types';

interface CompareMenuProps {
    models: Model[];
    currentModelId?: string;
    messageIndex: number;
    compareSelectedModels: Set<string>;
    compareSearchQuery: string;
    onSearchChange: (query: string) => void;
    onToggleModel: (modelId: string) => void;
    onSelectAllLocal: () => void;
    onSelectAllApi: () => void;
    onStartComparison: () => void;
    onClose: () => void;
}

export default function CompareMenu({
    models,
    currentModelId,
    messageIndex,
    compareSelectedModels,
    compareSearchQuery,
    onSearchChange,
    onToggleModel,
    onSelectAllLocal,
    onSelectAllApi,
    onStartComparison,
    onClose
}: CompareMenuProps) {
    const searchRef = useRef<HTMLInputElement>(null);

    const filteredModels = useMemo(() =>
        models
            .filter(m => m.id !== currentModelId)
            .filter(m => !compareSearchQuery ||
                m.name.toLowerCase().includes(compareSearchQuery.toLowerCase()) ||
                m.id.toLowerCase().includes(compareSearchQuery.toLowerCase())
            ),
        [models, currentModelId, compareSearchQuery]
    );

    return (
        <div
            className="absolute top-full left-0 mt-1 w-64 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Search input */}
            <div className="px-3 py-2 border-b border-slate-700/50">
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        ref={searchRef}
                        type="text"
                        placeholder="Search models..."
                        value={compareSearchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                </div>
            </div>

            {/* Quick select buttons */}
            <div className="flex gap-1 p-2 border-b border-slate-700/50">
                <button
                    onClick={onSelectAllLocal}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                >
                    All Self-hosted
                </button>
                <button
                    onClick={onSelectAllApi}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
                >
                    All API
                </button>
            </div>

            {/* Model list */}
            <div className="max-h-48 overflow-y-auto">
                {filteredModels.map(model => (
                    <button
                        key={model.id}
                        onClick={() => onToggleModel(model.id)}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${compareSelectedModels.has(model.id)
                                ? 'bg-slate-700/50 text-white'
                                : 'text-slate-300 hover:bg-slate-700/30'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${model.type === 'self-hosted' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                            <span>{model.name}</span>
                        </div>
                        {compareSelectedModels.has(model.id) && (
                            <Check size={12} className="text-emerald-400" />
                        )}
                    </button>
                ))}
            </div>

            {/* Start comparison button */}
            {compareSelectedModels.size > 0 && (
                <div className="p-2 border-t border-slate-700/50">
                    <button
                        onClick={onStartComparison}
                        className="w-full px-3 py-1.5 text-xs font-medium rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
                    >
                        Compare with {compareSelectedModels.size} model{compareSelectedModels.size > 1 ? 's' : ''}
                    </button>
                </div>
            )}
        </div>
    );
}
