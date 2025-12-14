import { useState, useRef, useEffect } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Terminal, Cpu, Bot, CheckCircle, AlertTriangle } from 'lucide-react';

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
    // onSelectModel,
    githubToken,
    onOpenTopics
}: OrchestratorViewProps) {
    const [events, setEvents] = useState<OrchestrationEvent[]>([]);
    const [rounds, setRounds] = useState<OrchestrationEvent[][]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [inputFocused, setInputFocused] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    const handleStart = async (text: string) => {
        if (!text.trim() || !selectedModelId || isRunning) return;

        setIsRunning(true);
        setEvents([]); // Clear previous run
        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch(`/api/chat/orchestrator/stream?engine=autogen`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: text,
                    model: selectedModelId,
                    max_rounds: 10, // Default
                    temperature: 0.7, // Default
                    max_tokens: 2048, // Default
                    github_token: githubToken || null
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (!response.body) return;
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
                        try {
                            const jsonStr = line.slice(6);
                            const event: OrchestrationEvent = JSON.parse(jsonStr);
                            setEvents(prev => [...prev, event]);
                        } catch (e) {
                            console.error('Failed to parse SSE event', e);
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                setEvents(prev => [...prev, { event: 'error', error: error.message }]);
            }
        } finally {
            setIsRunning(false);
            abortControllerRef.current = null;
        }
    };

    const selectedModel = models.find(m => m.id === selectedModelId);

    return (
        <div className="flex flex-col h-full relative">
            {/* Header / Config Bar */}
            <div className="h-14 px-4 border-b border-slate-700/50 bg-slate-900/40 backdrop-blur-md z-10 rounded-t-2xl">
                <div className="max-w-3xl mx-auto h-full flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${selectedModel ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-slate-600'}`} />
                            <span className="text-sm font-semibold text-slate-200 tracking-tight">
                                {selectedModel ? selectedModel.name : 'Select a conductor from the dock'}
                            </span>
                        </div>
                        {selectedModel?.type === 'api' && (
                            <span className="text-[10px] uppercase tracking-wider bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20 font-medium">
                                API
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-1 rounded border border-white/5">
                        AUTOGEN • MULTI-AGENT
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 scroll-smooth pb-32"
            >
                <div className="max-w-3xl mx-auto w-full min-h-full flex flex-col space-y-6">
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
                placeholder={selectedModel ? `Instruct ${selectedModel.name} to solve a complex task...` : "Select a conductor model..."}
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
