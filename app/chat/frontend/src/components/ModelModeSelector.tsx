import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Zap, Search } from 'lucide-react';
import { Model } from '../types';
import { ChatAutoModeScope } from './ChatView';

interface ModelModeSelectorProps {
    models: Model[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    autoMode: boolean;
    setAutoMode: (value: boolean) => void;
    autoModeScope: ChatAutoModeScope;
    setAutoModeScope: (value: ChatAutoModeScope) => void;
    isGenerating: boolean;
}

type ExpandedDropdown = 'local' | 'api' | null;

export default function ModelModeSelector({
    models,
    selectedModelId,
    onSelectModel,
    autoMode,
    setAutoMode,
    autoModeScope,
    setAutoModeScope,
    isGenerating
}: ModelModeSelectorProps) {
    const [expandedDropdown, setExpandedDropdown] = useState<ExpandedDropdown>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Memoize model filtering
    const localModels = useMemo(() => models.filter(m => m.type === 'self-hosted'), [models]);
    const apiModels = useMemo(() => models.filter(m => m.type === 'github' || m.type === 'external'), [models]);

    // Filtered models based on search
    const filteredLocalModels = useMemo(() =>
        localModels.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [localModels, searchQuery]
    );
    const filteredApiModels = useMemo(() =>
        apiModels.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [apiModels, searchQuery]
    );

    const selectedModel = models.find(m => m.id === selectedModelId);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setExpandedDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close on Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setExpandedDropdown(null);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const handleModeClick = (scope: ChatAutoModeScope) => {
        setAutoMode(true);
        setAutoModeScope(scope);
        setExpandedDropdown(null);
        setSearchQuery('');
    };

    const handleDropdownToggle = (scope: ChatAutoModeScope, e: React.MouseEvent) => {
        e.stopPropagation();
        if (expandedDropdown === scope) {
            setExpandedDropdown(null);
            setSearchQuery('');
        } else {
            setExpandedDropdown(scope);
            setSearchQuery('');
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    };

    const handleModelSelect = (modelId: string) => {
        setAutoMode(false);
        onSelectModel(modelId);
        setExpandedDropdown(null);
        setSearchQuery('');
    };

    // Determine button states
    const isLocalActive = autoMode && autoModeScope === 'local';
    const isApiActive = autoMode && autoModeScope === 'api';
    const isManualLocal = !autoMode && selectedModel?.type === 'self-hosted';
    const isManualApi = !autoMode && selectedModel?.type === 'github' || selectedModel?.type === 'external';

    const getButtonLabel = (type: 'local' | 'api') => {
        if (type === 'local') {
            if (isLocalActive) return 'Self-Hosted Auto';
            if (isManualLocal) return selectedModel?.name || 'Self-Hosted';
            return 'Self-Hosted';
        } else {
            if (isApiActive) return 'GitHub Auto';
            if (isManualApi) return selectedModel?.name || 'GitHub';
            return 'GitHub';
        }
    };

    return (
        <div className="relative flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 backdrop-blur-sm" ref={containerRef}>
            {/* Local Button with Dropdown */}
            <div className="relative flex items-center">
                <button
                    onClick={() => handleModeClick('local')}
                    disabled={isGenerating}
                    className={`h-7 pl-3 pr-1 flex items-center gap-1.5 rounded-l-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${isLocalActive || isManualLocal
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                        }`}
                >
                    {isLocalActive ? (
                        <Zap size={12} className="text-emerald-400" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                    <span className="max-w-[80px] truncate">{getButtonLabel('local')}</span>
                </button>
                <button
                    onClick={(e) => handleDropdownToggle('local', e)}
                    disabled={isGenerating}
                    className={`h-7 px-1 flex items-center rounded-r-md transition-all ${isLocalActive || isManualLocal
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                        }`}
                >
                    <ChevronDown size={12} className={`transition-transform ${expandedDropdown === 'local' ? 'rotate-180' : ''}`} />
                </button>

                {/* Self-Hosted Models Dropdown */}
                {expandedDropdown === 'local' && localModels.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                        {/* Search input */}
                        {localModels.length > 5 && (
                            <div className="px-2 py-2 border-b border-slate-700/50">
                                <div className="relative">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-7 pr-2 py-1 text-xs bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                                    />
                                </div>
                            </div>
                        )}
                        {/* Auto option */}
                        <button
                            onClick={() => handleModeClick('local')}
                            className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between ${isLocalActive ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-slate-700/50'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Zap size={12} className="text-emerald-400" />
                                <span>Auto (Smart Fallback)</span>
                            </div>
                            {isLocalActive && <span className="text-emerald-400">✓</span>}
                        </button>
                        <div className="border-t border-slate-700/50" />
                        {/* Individual models - filtered */}
                        <div className="max-h-48 overflow-y-auto">
                            {filteredLocalModels.map(model => (
                                <button
                                    key={model.id}
                                    onClick={() => handleModelSelect(model.id)}
                                    className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between ${!autoMode && selectedModelId === model.id
                                        ? 'bg-emerald-500/20 text-slate-200'
                                        : 'text-slate-300 hover:bg-slate-700/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                                        <span>{model.name}</span>
                                    </div>
                                    {!autoMode && selectedModelId === model.id && (
                                        <span className="text-emerald-400">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-slate-600/50" />

            {/* API Button with Dropdown */}
            <div className="relative flex items-center">
                <button
                    onClick={() => handleModeClick('api')}
                    disabled={isGenerating}
                    className={`h-7 pl-3 pr-1 flex items-center gap-1.5 rounded-l-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${isApiActive || isManualApi
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                        }`}
                >
                    {isApiActive ? (
                        <Zap size={12} className="text-blue-400" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                    <span className="max-w-[80px] truncate">{getButtonLabel('api')}</span>
                </button>
                <button
                    onClick={(e) => handleDropdownToggle('api', e)}
                    disabled={isGenerating}
                    className={`h-7 px-1 flex items-center rounded-r-md transition-all ${isApiActive || isManualApi
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                        }`}
                >
                    <ChevronDown size={12} className={`transition-transform ${expandedDropdown === 'api' ? 'rotate-180' : ''}`} />
                </button>

                {/* GitHub Models Dropdown */}
                {expandedDropdown === 'api' && apiModels.length > 0 && (
                    <div className="absolute top-full right-0 mt-1 w-64 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                        {/* Search input - only show if > 5 models */}
                        {apiModels.length > 5 && (
                            <div className="px-2 py-2 border-b border-slate-700/50">
                                <div className="relative">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Search models..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-7 pr-2 py-1 text-xs bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                            </div>
                        )}
                        {/* Auto option */}
                        <button
                            onClick={() => handleModeClick('api')}
                            className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between ${isApiActive ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-slate-700/50'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Zap size={12} className="text-blue-400" />
                                <span>Auto (Smart Fallback)</span>
                            </div>
                            {isApiActive && <span className="text-blue-400">✓</span>}
                        </button>
                        <div className="border-t border-slate-700/50" />
                        {/* Individual models - filtered */}
                        <div className="max-h-48 overflow-y-auto">
                            {filteredApiModels.map(model => (
                                <button
                                    key={model.id}
                                    onClick={() => handleModelSelect(model.id)}
                                    className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between ${!autoMode && selectedModelId === model.id
                                        ? 'bg-blue-500/20 text-slate-200'
                                        : 'text-slate-300 hover:bg-slate-700/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                                        <span>{model.name}</span>
                                    </div>
                                    {!autoMode && selectedModelId === model.id && (
                                        <span className="text-blue-400">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
