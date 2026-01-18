import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, AlertTriangle } from 'lucide-react';
import { Model } from '../types';

interface ModelTabsProps {
    models: Model[];
    selectedModels: Set<string>;
    onToggleModel: (modelId: string) => void;
    isGenerating: boolean;
    githubToken?: string;
    onConnectGitHub?: () => void;
    dropDirection?: 'up' | 'down';
}

type ExpandedDropdown = 'self-hosted' | 'github' | null;

export default function ModelTabs({ models, selectedModels, onToggleModel, isGenerating, githubToken, onConnectGitHub, dropDirection = 'up' }: ModelTabsProps) {
    const [expandedDropdown, setExpandedDropdown] = useState<ExpandedDropdown>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const localModels = useMemo(() => models.filter(m => m.type === 'self-hosted'), [models]);
    const apiModels = useMemo(() => models.filter(m => m.type === 'github'), [models]);

    const filteredLocalModels = useMemo(() =>
        localModels.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [localModels, searchQuery]
    );
    const filteredApiModels = useMemo(() =>
        apiModels.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [apiModels, searchQuery]
    );

    const selectedLocalCount = localModels.filter(m => selectedModels.has(m.id)).length;
    const selectedApiCount = apiModels.filter(m => selectedModels.has(m.id)).length;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setExpandedDropdown(null);
                setSearchQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setExpandedDropdown(null);
                setSearchQuery('');
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const handleDropdownToggle = (type: ExpandedDropdown) => {
        if (expandedDropdown === type) {
            setExpandedDropdown(null);
            setSearchQuery('');
        } else {
            setExpandedDropdown(type);
            setSearchQuery('');
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    };

    const toggleAllInCategory = (categoryModels: Model[]) => {
        const allSelected = categoryModels.every(m => selectedModels.has(m.id));
        categoryModels.forEach(m => {
            if (allSelected || !selectedModels.has(m.id)) {
                onToggleModel(m.id);
            }
        });
    };

    const getGroupName = (type: 'self-hosted' | 'github') =>
        type === 'self-hosted' ? 'Self-Hosted' : 'GitHub';

    const showGithubWarning = selectedApiCount > 0 && !githubToken;

    const ChevronIcon = dropDirection === 'up' ? ChevronUp : ChevronDown;
    const chevronRotation = (isOpen: boolean) => {
        if (dropDirection === 'up') return isOpen ? 'rotate-180' : '';
        return isOpen ? 'rotate-180' : '';
    };

    const warnings = showGithubWarning && (
        <div className="flex flex-col items-center gap-1">
            {onConnectGitHub ? (
                <button
                    onClick={onConnectGitHub}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs hover:bg-blue-500/20 transition-colors"
                >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                    <span>Connect GitHub for dedicated quota</span>
                </button>
            ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
                    <AlertTriangle size={11} className="shrink-0 text-yellow-500" />
                    <span>Add GitHub token in Settings for dedicated quota</span>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col items-center gap-2" ref={containerRef}>
            {/* Warnings above when dropdown goes up */}
            {dropDirection === 'up' && warnings}

            {/* Model selector bar */}
            <div className="relative flex items-center gap-1 bg-slate-800/90 rounded-lg p-1 border border-slate-700/50 backdrop-blur-md shadow-lg">
                {/* Self-Hosted */}
                {localModels.length > 0 && (
                    <>
                        <div className="relative flex items-center">
                            <button
                                onClick={() => handleDropdownToggle('self-hosted')}
                                disabled={isGenerating}
                                className={`h-7 w-[140px] flex items-center justify-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
                                    selectedLocalCount > 0
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                                }`}
                            >
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span>{getGroupName('self-hosted')}</span>
                                <span className={`text-[10px] ${selectedLocalCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                    {selectedLocalCount}/{localModels.length}
                                </span>
                                <ChevronIcon size={12} className={`transition-transform ${chevronRotation(expandedDropdown === 'self-hosted')}`} />
                            </button>

                            {expandedDropdown === 'self-hosted' && (
                                <ModelDropdown
                                    models={filteredLocalModels}
                                    allModels={localModels}
                                    selectedModels={selectedModels}
                                    onToggleModel={onToggleModel}
                                    onToggleAll={() => toggleAllInCategory(localModels)}
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    searchInputRef={searchInputRef}
                                    color="emerald"
                                    showSearch={localModels.length > 5}
                                    direction={dropDirection}
                                />
                            )}
                        </div>
                        <div className="w-px h-5 bg-slate-600/50" />
                    </>
                )}

                {/* GitHub */}
                {apiModels.length > 0 && (
                    <div className="relative flex items-center">
                        <button
                            onClick={() => handleDropdownToggle('github')}
                            disabled={isGenerating}
                            className={`h-7 w-[140px] flex items-center justify-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
                                selectedApiCount > 0
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                            }`}
                        >
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span>{getGroupName('github')}</span>
                            <span className={`text-[10px] ${selectedApiCount > 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                                {selectedApiCount}/{apiModels.length}
                            </span>
                            <ChevronIcon size={12} className={`transition-transform ${chevronRotation(expandedDropdown === 'github')}`} />
                        </button>

                        {expandedDropdown === 'github' && (
                            <ModelDropdown
                                models={filteredApiModels}
                                allModels={apiModels}
                                selectedModels={selectedModels}
                                onToggleModel={onToggleModel}
                                onToggleAll={() => toggleAllInCategory(apiModels)}
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                searchInputRef={searchInputRef}
                                color="blue"
                                showSearch={apiModels.length > 5}
                                direction={dropDirection}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Warnings below when dropdown goes down */}
            {dropDirection === 'down' && warnings}
        </div>
    );
}

function ModelDropdown({
    models,
    allModels,
    selectedModels,
    onToggleModel,
    onToggleAll,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    color,
    showSearch,
    direction,
}: {
    models: Model[];
    allModels: Model[];
    selectedModels: Set<string>;
    onToggleModel: (id: string) => void;
    onToggleAll: () => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    searchInputRef: React.RefObject<HTMLInputElement>;
    color: 'emerald' | 'blue';
    showSearch: boolean;
    direction: 'up' | 'down';
}) {
    const allSelected = allModels.every(m => selectedModels.has(m.id));
    const colorClasses = {
        emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', check: 'text-emerald-400', dot: 'bg-emerald-500/50', border: 'focus:border-emerald-500/50' },
        blue: { bg: 'bg-blue-500/20', text: 'text-blue-300', check: 'text-blue-400', dot: 'bg-blue-500/50', border: 'focus:border-blue-500/50' },
    }[color];

    const positionClass = direction === 'up'
        ? 'bottom-full left-0 mb-2'
        : 'top-full left-0 mt-2';

    const animationClass = direction === 'up'
        ? 'animate-in fade-in slide-in-from-bottom-2'
        : 'animate-in fade-in slide-in-from-top-2';

    return (
        <div
            className={`absolute ${positionClass} w-56 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl z-[100] overflow-hidden ${animationClass} duration-150`}
            onClick={(e) => e.stopPropagation()}
            data-no-arena-scroll
        >
            {/* Search at top when opening down */}
            {direction === 'down' && showSearch && (
                <>
                    <div className="px-2 py-2">
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`w-full pl-7 pr-2 py-1 text-xs bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 placeholder-slate-500 focus:outline-none ${colorClasses.border}`}
                            />
                        </div>
                    </div>
                    <div className="border-t border-slate-700/50" />
                </>
            )}

            {/* Select/Deselect All - at top when down, at bottom when up */}
            {direction === 'down' && (
                <>
                    <button
                        onClick={onToggleAll}
                        className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between ${
                            allSelected ? `${colorClasses.bg} ${colorClasses.text}` : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                    >
                        <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                        {allSelected && <span className={colorClasses.check}>✓</span>}
                    </button>
                    <div className="border-t border-slate-700/50" />
                </>
            )}

            {/* Models list */}
            <div
                className="max-h-48 overflow-y-scroll chat-scroll"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {models.map(model => {
                    const isSelected = selectedModels.has(model.id);
                    return (
                        <button
                            key={model.id}
                            onClick={() => onToggleModel(model.id)}
                            className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between ${
                                isSelected ? `${colorClasses.bg} text-slate-200` : 'text-slate-300 hover:bg-slate-700/50'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${colorClasses.dot}`} />
                                <span>{model.name}</span>
                            </div>
                            {isSelected && <span className={colorClasses.check}>✓</span>}
                        </button>
                    );
                })}
            </div>

            {/* Select/Deselect All - at bottom when up */}
            {direction === 'up' && (
                <>
                    <div className="border-t border-slate-700/50" />
                    <button
                        onClick={onToggleAll}
                        className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors flex items-center justify-between ${
                            allSelected ? `${colorClasses.bg} ${colorClasses.text}` : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                    >
                        <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                        {allSelected && <span className={colorClasses.check}>✓</span>}
                    </button>
                </>
            )}

            {/* Search at bottom when opening up */}
            {direction === 'up' && showSearch && (
                <>
                    <div className="border-t border-slate-700/50" />
                    <div className="px-2 py-2">
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`w-full pl-7 pr-2 py-1 text-xs bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 placeholder-slate-500 focus:outline-none ${colorClasses.border}`}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
