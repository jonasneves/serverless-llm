import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, AlertTriangle } from 'lucide-react';
import { Model } from '../types';

interface ModelTabsProps {
    models: Model[];
    selectedModels: Set<string>;
    onToggleModel: (modelId: string) => void;
    isGenerating: boolean;
    githubToken?: string;
    openrouterKey?: string;
    dropDirection?: 'up' | 'down';
}

type ExpandedDropdown = 'self-hosted' | 'github' | 'external' | null;

export default function ModelTabs({ models, selectedModels, onToggleModel, isGenerating, githubToken, openrouterKey, dropDirection = 'up' }: ModelTabsProps) {
    const [expandedDropdown, setExpandedDropdown] = useState<ExpandedDropdown>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const localModels = useMemo(() => models.filter(m => m.type === 'self-hosted'), [models]);
    const apiModels = useMemo(() => models.filter(m => m.type === 'github'), [models]);
    const externalModels = useMemo(() => models.filter(m => m.type === 'external'), [models]);

    const filteredLocalModels = useMemo(() =>
        localModels.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [localModels, searchQuery]
    );
    const filteredApiModels = useMemo(() =>
        apiModels.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [apiModels, searchQuery]
    );
    const filteredExternalModels = useMemo(() =>
        externalModels.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [externalModels, searchQuery]
    );

    const selectedLocalCount = localModels.filter(m => selectedModels.has(m.id)).length;
    const selectedApiCount = apiModels.filter(m => selectedModels.has(m.id)).length;
    const selectedExternalCount = externalModels.filter(m => selectedModels.has(m.id)).length;

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

    const getGroupName = (type: 'self-hosted' | 'github' | 'external') =>
        type === 'self-hosted' ? 'Self-Hosted' : type === 'github' ? 'GitHub' : 'External';

    const showGithubWarning = selectedApiCount > 0 && !githubToken;
    const showExternalWarning = selectedExternalCount > 0 && !openrouterKey;

    const ChevronIcon = dropDirection === 'up' ? ChevronUp : ChevronDown;
    const chevronRotation = (isOpen: boolean) => {
        if (dropDirection === 'up') return isOpen ? 'rotate-180' : '';
        return isOpen ? 'rotate-180' : '';
    };

    const warnings = (showGithubWarning || showExternalWarning) && (
        <div className="flex flex-col items-center gap-1">
            {showGithubWarning && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
                    <AlertTriangle size={11} className="shrink-0 text-yellow-500" />
                    <span>Add GitHub token in Settings for dedicated quota</span>
                </div>
            )}
            {showExternalWarning && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
                    <AlertTriangle size={11} className="shrink-0 text-yellow-500" />
                    <span>Add OpenRouter key in Settings for external models</span>
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
                                className={`h-7 px-3 flex items-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
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
                    <>
                        <div className="relative flex items-center">
                            <button
                                onClick={() => handleDropdownToggle('github')}
                                disabled={isGenerating}
                                className={`h-7 px-3 flex items-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
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
                        {externalModels.length > 0 && <div className="w-px h-5 bg-slate-600/50" />}
                    </>
                )}

                {/* External */}
                {externalModels.length > 0 && (
                    <div className="relative flex items-center">
                        <button
                            onClick={() => handleDropdownToggle('external')}
                            disabled={isGenerating}
                            className={`h-7 px-3 flex items-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
                                selectedExternalCount > 0
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                            }`}
                        >
                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                            <span>{getGroupName('external')}</span>
                            <span className={`text-[10px] ${selectedExternalCount > 0 ? 'text-purple-400' : 'text-slate-500'}`}>
                                {selectedExternalCount}/{externalModels.length}
                            </span>
                            <ChevronIcon size={12} className={`transition-transform ${chevronRotation(expandedDropdown === 'external')}`} />
                        </button>

                        {expandedDropdown === 'external' && (
                            <ModelDropdown
                                models={filteredExternalModels}
                                allModels={externalModels}
                                selectedModels={selectedModels}
                                onToggleModel={onToggleModel}
                                onToggleAll={() => toggleAllInCategory(externalModels)}
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                searchInputRef={searchInputRef}
                                color="purple"
                                showSearch={externalModels.length > 5}
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
    color: 'emerald' | 'blue' | 'purple';
    showSearch: boolean;
    direction: 'up' | 'down';
}) {
    const allSelected = allModels.every(m => selectedModels.has(m.id));
    const colorClasses = {
        emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', check: 'text-emerald-400', dot: 'bg-emerald-500/50', border: 'focus:border-emerald-500/50' },
        blue: { bg: 'bg-blue-500/20', text: 'text-blue-300', check: 'text-blue-400', dot: 'bg-blue-500/50', border: 'focus:border-blue-500/50' },
        purple: { bg: 'bg-purple-500/20', text: 'text-purple-300', check: 'text-purple-400', dot: 'bg-purple-500/50', border: 'focus:border-purple-500/50' },
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
