import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Model } from '../types';

interface ModelSelectorProps {
    models: Model[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    isGenerating: boolean;
}

export default function ModelSelector({
    models,
    selectedModelId,
    onSelectModel,
    isGenerating
}: ModelSelectorProps) {
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [expandedLocalModels, setExpandedLocalModels] = useState(true);
    const [expandedApiModels, setExpandedApiModels] = useState(false);
    const modelSelectorRef = useRef<HTMLDivElement>(null);

    const selectedModel = models.find(m => m.id === selectedModelId);

    // Memoize expensive model filtering
    const localModels = useMemo(() => models.filter(m => m.type === 'self-hosted'), [models]);
    const apiModels = useMemo(() => models.filter(m => m.type === 'github' || m.type === 'external'), [models]);

    // Close model selector when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
                setShowModelSelector(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={modelSelectorRef}>
            <button
                onClick={() => setShowModelSelector(!showModelSelector)}
                className="h-7 px-3 flex items-center gap-2 rounded-lg border bg-slate-700/40 hover:bg-slate-700/60 border-slate-600/40 backdrop-blur-sm transition-all active:scale-95 text-xs font-medium"
                disabled={isGenerating}
            >
                {selectedModel && (
                    <div className={`w-2 h-2 rounded-full ${selectedModel.type === 'self-hosted' ? 'bg-emerald-500' : selectedModel.type === 'external' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                )}
                <span className="text-slate-200/80">{selectedModel ? selectedModel.name : 'Select a model'}</span>
                {!isGenerating && <ChevronDown size={12} className="text-slate-400" />}
            </button>

            {showModelSelector && !isGenerating && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-[99]" onClick={() => setShowModelSelector(false)} />

                    {/* Dropdown */}
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 max-h-[70vh] bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {models.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-slate-500 text-center">
                                No models available
                            </div>
                        ) : (
                            <div className="overflow-y-auto flex-1">
                                {localModels.length > 0 && (
                                    <div>
                                        <button
                                            onClick={() => setExpandedLocalModels(!expandedLocalModels)}
                                            className="w-full px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold hover:bg-slate-700/30 transition-colors sticky top-0 bg-slate-800 z-10"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                <span>Self-Hosted Models</span>
                                            </div>
                                            <ChevronDown size={12} className={`transition-transform ${expandedLocalModels ? '' : '-rotate-90'}`} />
                                        </button>
                                        {expandedLocalModels && (
                                            <div>
                                                {localModels.map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => {
                                                            onSelectModel(model.id);
                                                            setShowModelSelector(false);
                                                        }}
                                                        className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${selectedModelId === model.id
                                                            ? 'bg-emerald-500/20 text-slate-200'
                                                            : 'text-slate-300 hover:bg-slate-700/50'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-emerald-500/40" />
                                                                <span>{model.name}</span>
                                                            </div>
                                                            {selectedModelId === model.id && (
                                                                <span className="text-emerald-400">✓</span>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {apiModels.length > 0 && (
                                    <div>
                                        <button
                                            onClick={() => setExpandedApiModels(!expandedApiModels)}
                                            className="w-full px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold hover:bg-slate-700/30 transition-colors border-t border-slate-700/50 sticky top-0 bg-slate-800 z-10"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                <span>GitHub Models</span>
                                            </div>
                                            <ChevronDown size={12} className={`transition-transform ${expandedApiModels ? '' : '-rotate-90'}`} />
                                        </button>
                                        {expandedApiModels && (
                                            <div>
                                                {apiModels.map(model => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => {
                                                            onSelectModel(model.id);
                                                            setShowModelSelector(false);
                                                        }}
                                                        className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${selectedModelId === model.id
                                                            ? 'bg-blue-500/20 text-slate-200'
                                                            : 'text-slate-300 hover:bg-slate-700/50'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-blue-500/40" />
                                                                <span>{model.name}</span>
                                                            </div>
                                                            {selectedModelId === model.id && (
                                                                <span className="text-blue-400">✓</span>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
