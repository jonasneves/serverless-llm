import { useState, useRef, useEffect } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Terminal, Cpu, Bot, CheckCircle, AlertTriangle, Eraser, Zap, ChevronDown } from 'lucide-react';
import { getModelPriority } from '../constants';

type AutoModeScope = 'all' | 'local' | 'api';

interface OrchestratorViewProps {
    id?: string;
    models: Model[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    githubToken?: string;
    onOpenTopics: () => void;
}

interface OrchestrationEvent {
    event: string;
    // Common fields
    content?: string;
    model?: string;
    model_id?: string;
    // Specific fields
    agents?: string[];
    tools?: string[];
    agent?: string;
    round?: number;
    tool?: string;
    arguments?: any;
    result?: any;
    summary?: {
        framework: string;
        status: string;
        total_rounds?: number;
        agents_used?: string[];
    };
    error?: string;
    endpoints?: Record<string, string>;
    message?: string;
}


export default function OrchestratorView({
    models,
    selectedModelId,
    onSelectModel,
    githubToken,
    onOpenTopics
}: OrchestratorViewProps) {
    const [events, setEvents] = useState<OrchestrationEvent[]>([]);
    const [rounds, setRounds] = useState<OrchestrationEvent[][]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [inputFocused, setInputFocused] = useState(false);
    const [autoMode, setAutoMode] = useState(true);
    const [autoModeScope, setAutoModeScope] = useState<AutoModeScope>('local');
    const [showAutoDropdown, setShowAutoDropdown] = useState(false);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [expandedLocalModels, setExpandedLocalModels] = useState(true);
    const [expandedApiModels, setExpandedApiModels] = useState(false);
    const [currentAutoModel, setCurrentAutoModel] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);

    // Group events into rounds for display
    useEffect(() => {
        const newRounds: OrchestrationEvent[][] = [];
        let currentRound: OrchestrationEvent[] = [];

        events.forEach(event => {
            if (event.event === 'round_start') {
                if (currentRound.length > 0) {
                    newRounds.push(currentRound);
                }
                currentRound = [event];
            } else if (event.event === 'complete' || event.event === 'final_answer') {
                // Keep these separate or part of the last round?
                // Let's treat them as part of the flow
                currentRound.push(event);
            } else {
                currentRound.push(event);
            }
        });
        if (currentRound.length > 0) {
            newRounds.push(currentRound);
        }
        setRounds(newRounds);
    }, [events]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events, rounds]);

    // Auto-focus input on keydown
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
            if (e.key.length === 1) {
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowAutoDropdown(false);
            }
            if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
                setShowModelSelector(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const tryOrchestrator = async (modelId: string, query: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const response = await fetch(`/api/chat/orchestrator/stream?engine=autogen`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query,
                    model: modelId,
                    max_rounds: 10,
                    temperature: 0.7,
                    max_tokens: 2048,
                    github_token: githubToken || null
                }),
                signal: abortControllerRef.current?.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                buffer += chunk;
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6);
                        try {
                            const event: OrchestrationEvent = JSON.parse(jsonStr);
                            setEvents(prev => [...prev, event]);

                            if (event.event === 'error') {
                                throw new Error(event.error || 'Unknown error');
                            }
                        } catch (e) {
                            if (e instanceof Error && e.message !== jsonStr) {
                                throw e;
                            }
                        }
                    }
                }
            }

            return { success: true };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw error;
            }
            return { success: false, error: error.message };
        }
    };

    const handleStart = async (text: string) => {
        if (!text.trim() || isRunning) return;
        if (!autoMode && !selectedModelId) return;

        setIsRunning(true);
        setEvents([]);
        abortControllerRef.current = new AbortController();

        try {
            if (autoMode) {
                const scopedModels = models.filter(m => {
                    if (autoModeScope === 'all') return true;
                    if (autoModeScope === 'local') return m.type === 'local';
                    if (autoModeScope === 'api') return m.type === 'api';
                    return true;
                });

                const sortedModels = scopedModels
                    .map(m => {
                        const basePriority = getModelPriority(m.id, m.type || 'local');
                        const adjustedPriority = autoModeScope === 'all' && m.type === 'api'
                            ? basePriority + 1000
                            : basePriority;
                        return { ...m, priority: adjustedPriority };
                    })
                    .sort((a, b) => {
                        if (a.priority !== b.priority) {
                            return a.priority - b.priority;
                        }
                        if (a.type !== b.type) {
                            return a.type === 'local' ? -1 : 1;
                        }
                        return a.id.localeCompare(b.id);
                    });

                let lastError: string | undefined;

                for (const model of sortedModels) {
                    setCurrentAutoModel(model.id);
                    const result = await tryOrchestrator(model.id, text);

                    if (result.success) {
                        setCurrentAutoModel(null);
                        return;
                    }

                    lastError = result.error;
                }

                const scopeLabel = autoModeScope === 'all' ? 'all' : autoModeScope;
                setEvents(prev => [...prev, {
                    event: 'error',
                    error: `All ${scopeLabel} models failed to respond. Last error: ${lastError}`
                }]);
                setCurrentAutoModel(null);
            } else {
                if (!selectedModelId) return;
                const result = await tryOrchestrator(selectedModelId, text);

                if (!result.success && result.error) {
                    setEvents(prev => [...prev, { event: 'error', error: result.error }]);
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                setEvents(prev => [...prev, { event: 'error', error: error.message }]);
            }
        } finally {
            setIsRunning(false);
            setCurrentAutoModel(null);
            abortControllerRef.current = null;
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsRunning(false);
        }
    };

    const handleClear = () => {
        setEvents([]);
        setRounds([]);
    };

    const selectedModel = models.find(m => m.id === selectedModelId);

    const autoScopeLabels: Record<AutoModeScope, string> = {
        all: 'All',
        local: 'Local',
        api: 'API'
    };

    return (
        <div className="flex flex-col h-full relative">
            {/* Header / Config Bar */}
            <div className="z-10 w-full flex justify-center pt-6 pb-2">
                <div className="w-full flex items-center justify-between" style={{ maxWidth: '600px' }}>
                    {/* Left: Main control (Auto or Model selector) */}
                    <div className="flex items-center gap-2">
                        {autoMode ? (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setShowAutoDropdown(!showAutoDropdown)}
                                    className="h-8 px-2 flex items-center gap-1.5 rounded-lg border bg-yellow-500/30 hover:bg-yellow-500/40 border-yellow-500/30 text-yellow-300 transition-all active:scale-95 text-xs font-medium"
                                >
                                    <Zap size={12} />
                                    <span>Auto: {autoScopeLabels[autoModeScope]}</span>
                                    <ChevronDown size={12} className={`transition-transform ${showAutoDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showAutoDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                                        {(['all', 'local', 'api'] as AutoModeScope[]).map(scope => (
                                            <button
                                                key={scope}
                                                onClick={() => {
                                                    setAutoModeScope(scope);
                                                    setShowAutoDropdown(false);
                                                }}
                                                className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${autoModeScope === scope
                                                    ? 'bg-yellow-500/20 text-yellow-300'
                                                    : 'text-slate-300 hover:bg-slate-700/50'
                                                    }`}
                                            >
                                                {autoScopeLabels[scope]}
                                                {scope === 'all' && <span className="text-[10px] text-slate-500 ml-1">(local → API)</span>}
                                                {scope === 'local' && <span className="text-[10px] text-slate-500 ml-1">(no quota)</span>}
                                                {scope === 'api' && <span className="text-[10px] text-slate-500 ml-1">(cloud only)</span>}
                                            </button>
                                        ))}
                                        <div className="border-t border-slate-700">
                                            <button
                                                onClick={() => {
                                                    setAutoMode(false);
                                                    setShowAutoDropdown(false);
                                                }}
                                                className="w-full px-3 py-2 text-left text-xs font-medium text-slate-400 hover:bg-slate-700/50 transition-colors"
                                            >
                                                Manual Mode
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative" ref={modelSelectorRef}>
                                <button
                                    onClick={() => setShowModelSelector(!showModelSelector)}
                                    className="h-8 px-2 flex items-center gap-1.5 rounded-lg border bg-white/5 hover:bg-white/10 border-white/5 text-slate-200 transition-all active:scale-95 text-xs font-medium"
                                    disabled={isRunning}
                                >
                                    <span>{selectedModel ? selectedModel.name : 'Select model'}</span>
                                    {!isRunning && <ChevronDown size={12} />}
                                </button>

                                {showModelSelector && !isRunning && (
                                    <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                                        {models.length === 0 ? (
                                            <div className="px-3 py-4 text-xs text-slate-500 text-center">
                                                No models available
                                            </div>
                                        ) : (
                                            <>
                                                {models.filter(m => m.type === 'local').length > 0 && (
                                                    <div>
                                                        <button
                                                            onClick={() => setExpandedLocalModels(!expandedLocalModels)}
                                                            className="w-full px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold hover:bg-slate-700/30 transition-colors"
                                                        >
                                                            <span>Local Models</span>
                                                            <ChevronDown size={12} className={`transition-transform ${expandedLocalModels ? '' : '-rotate-90'}`} />
                                                        </button>
                                                        {expandedLocalModels && (
                                                            <div>
                                                                {models.filter(m => m.type === 'local').map(model => (
                                                                    <button
                                                                        key={model.id}
                                                                        onClick={() => {
                                                                            onSelectModel(model.id);
                                                                            setShowModelSelector(false);
                                                                        }}
                                                                        className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${selectedModelId === model.id
                                                                            ? 'bg-blue-500/20 text-blue-300'
                                                                            : 'text-slate-300 hover:bg-slate-700/50'
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <span>{model.name}</span>
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

                                                {models.filter(m => m.type === 'api').length > 0 && (
                                                    <div>
                                                        <button
                                                            onClick={() => setExpandedApiModels(!expandedApiModels)}
                                                            className="w-full px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold hover:bg-slate-700/30 transition-colors border-t border-slate-700/50"
                                                        >
                                                            <span>API Models</span>
                                                            <ChevronDown size={12} className={`transition-transform ${expandedApiModels ? '' : '-rotate-90'}`} />
                                                        </button>
                                                        {expandedApiModels && (
                                                            <div>
                                                                {models.filter(m => m.type === 'api').map(model => (
                                                                    <button
                                                                        key={model.id}
                                                                        onClick={() => {
                                                                            onSelectModel(model.id);
                                                                            setShowModelSelector(false);
                                                                        }}
                                                                        className={`w-full px-4 py-2 text-left text-xs font-medium transition-colors ${selectedModelId === model.id
                                                                            ? 'bg-blue-500/20 text-blue-300'
                                                                            : 'text-slate-300 hover:bg-slate-700/50'
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <span>{model.name}</span>
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

                                                <div className="border-t border-slate-700">
                                                    <button
                                                        onClick={() => {
                                                            setAutoMode(true);
                                                            setShowModelSelector(false);
                                                        }}
                                                        className="w-full px-3 py-2 text-left text-xs font-medium text-yellow-400 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                                                    >
                                                        <Zap size={12} />
                                                        <span>Enable Auto Mode</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {isRunning && currentAutoModel && autoMode && (
                            <span className="text-xs text-slate-400">
                                {models.find(m => m.id === currentAutoModel)?.name}
                            </span>
                        )}
                    </div>

                    {/* Center: Badge */}
                    <div className="flex-1 flex justify-center items-center">
                        <div className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-1 rounded border border-white/5">
                            AUTOGEN • MULTI-AGENT
                        </div>
                    </div>

                    {/* Right: Clear button */}
                    <button
                        onClick={handleClear}
                        className="h-8 px-2 flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-slate-400 hover:text-white transition-all active:scale-95 text-xs font-medium"
                        title="Clear History"
                    >
                        <Eraser size={12} />
                        <span>Clear</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 scroll-smooth pb-32 chat-scroll"
                data-no-arena-scroll
            >
                <div className="mx-auto w-full min-h-full flex flex-col space-y-6" style={{ maxWidth: '600px' }}>
                    {events.length === 0 && !isRunning && (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50 select-none">
                            <Terminal size={48} className="mb-4" />
                            <p className="text-lg">Select a model and describe a task to begin orchestration.</p>
                        </div>
                    )}

                    {rounds.map((roundEvents, roundIdx) => (
                        <div key={roundIdx} className="border border-white/5 bg-white/5 rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Round header logic if needed */}
                            <div className="bg-white/5 px-4 py-2 text-xs font-mono text-slate-400 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                Round {roundIdx + 1}
                            </div>

                            <div className="p-4 space-y-4">
                                {roundEvents.map((ev, evIdx) => (
                                    <EventRenderer key={evIdx} event={ev} />
                                ))}
                            </div>
                        </div>
                    ))}

                    {isRunning && (
                        <div className="flex justify-center p-4">
                            <div className="animate-pulse flex items-center gap-2 text-indigo-400 text-sm font-mono">
                                <Cpu className="animate-spin-slow" size={16} />
                                Orchestrating...
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Input Area */}
            <PromptInput
                inputRef={inputRef}
                inputFocused={inputFocused}
                setInputFocused={setInputFocused}
                onSendMessage={handleStart}
                onOpenTopics={onOpenTopics}
                placeholder={selectedModel ? `Instruct ${selectedModel.name} to solve a complex task...` : "Select a conductor from the dock..."}
                isGenerating={isRunning}
                onStop={handleStop}
            />
        </div>
    );
}

function EventRenderer({ event }: { event: OrchestrationEvent }) {
    if (event.event === 'agents_ready') {
        return (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-md p-3 text-sm">
                <div className="flex items-center gap-2 text-indigo-400 mb-1 font-semibold">
                    <Bot size={16} /> Team Assembled
                </div>
                <div className="text-slate-300">
                    Agents: <span className="text-white">{event.agents?.join(', ')}</span>
                </div>
            </div>
        );
    }

    if (event.event === 'agent_message') {
        return (
            <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 text-xs font-bold uppercase">
                    {event.agent?.[0] || 'A'}
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5 flex-1 min-w-0">
                    <div className="text-xs text-purple-400 font-bold mb-1 uppercase tracking-wider">{event.agent}</div>
                    <div className="prose prose-invert prose-sm max-w-none">
                        <FormattedContent text={event.content || ''} />
                    </div>
                </div>
            </div>
        )
    }

    if (event.event === 'tool_call') {
        return (
            <div className="ml-8 border-l-2 border-emerald-500/30 pl-4 py-2 my-2">
                <div className="text-emerald-400 text-xs font-mono flex items-center gap-2 mb-1">
                    <Terminal size={12} />
                    Calling Tool: <span className="font-bold">{event.tool}</span>
                </div>
                <pre className="text-xs bg-black/30 p-2 rounded text-slate-400 overflow-x-auto">
                    {JSON.stringify(event.arguments, null, 2)}
                </pre>
            </div>
        )
    }

    if (event.event === 'tool_result') {
        return (
            <div className="ml-8 border-l-2 border-emerald-500/30 pl-4 py-2 my-2 opacity-80">
                <div className="text-emerald-500/70 text-xs font-mono mb-1">Tool Result</div>
                <div className="prose prose-invert prose-xs">
                    <FormattedContent text={event.result?.content || JSON.stringify(event.result)} />
                </div>
            </div>
        )
    }

    if (event.event === 'orchestrator_thinking') {
        return (
            <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-lg p-3 text-sm italic text-yellow-200/80">
                <span className="font-semibold text-xs not-italic text-yellow-500 block mb-1">Thinking Process</span>
                <FormattedContent text={event.content || ''} />
            </div>
        )
    }

    if (event.event === 'final_answer') {
        return (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mt-4">
                <div className="flex items-center gap-2 text-green-400 font-bold mb-2">
                    <CheckCircle size={18} /> Final Answer
                </div>
                <div className="prose prose-invert prose-sm max-w-none">
                    <FormattedContent text={event.content || ''} />
                </div>
            </div>
        )
    }

    if (event.event === 'error') {
        return (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg flex items-start gap-3 text-red-200">
                <AlertTriangle className="text-red-500 flex-shrink-0" />
                <div>
                    <div className="font-bold text-red-400 text-sm">Orchestration Error</div>
                    <div className="text-sm mt-1">{event.error}</div>
                    {event.endpoints && (
                        <div className="text-xs mt-2 opacity-70 font-mono">
                            {Object.entries(event.endpoints).map(([k, v]) => (
                                <div key={k}>{k}: {v}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return null;
}
