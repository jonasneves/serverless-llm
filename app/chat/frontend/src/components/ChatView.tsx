import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User, Check, Copy, Puzzle } from 'lucide-react';
import { extractTextWithoutJSON } from '../hooks/useGestureOptions';
import GestureOptions from './GestureOptions';
import { fetchChatStream, streamSseEvents } from '../utils/streaming';
import ModelTabs from './ModelTabs';
import { useGestureOptional } from '../context/GestureContext';
import ExecutionTimeDisplay, { ExecutionTimeData } from './ExecutionTimeDisplay';
import { usePersistedSetting } from '../hooks/usePersistedSetting';

const UI_BUILDER_PROMPT = `You can output interactive UI elements using JSON. When appropriate, include clickable options:

\`\`\`json
{
  "options": [
    {"id": "opt1", "label": "Option 1", "action": "message", "value": "User selected option 1"},
    {"id": "opt2", "label": "Option 2", "action": "message", "value": "User selected option 2"}
  ]
}
\`\`\`

Guidelines:
- Use for choices, confirmations, or navigation
- 2-4 options max
- Keep labels short
- Include JSON after your text response`;

export interface ChatViewHandle {
    sendMessage: (text: string, fromGesture?: boolean) => void;
    setInput: (text: string) => void;
    stopGeneration: () => void;
    scroll: (deltaY: number) => void;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    modelName?: string;
    modelId?: string;
    error?: boolean;
    timing?: ExecutionTimeData;
}

interface ChatViewProps {
    models: Model[];
    selectedModels: Set<string>;
    onToggleModel: (modelId: string) => void;
    githubToken?: string;
    openrouterKey?: string;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    isGenerating: boolean;
    setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
    gesturesActive?: boolean;
}

const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(({
    models,
    selectedModels,
    onToggleModel,
    githubToken,
    openrouterKey,
    messages,
    setMessages,
    isGenerating,
    setIsGenerating,
    gesturesActive = false,
}, ref) => {
    const [inputFocused, setInputFocused] = useState(false);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [streamingResponses, setStreamingResponses] = useState<Map<string, string>>(new Map());
    const [streamingTiming, setStreamingTiming] = useState<Map<string, ExecutionTimeData>>(new Map());
    const [uiBuilderEnabled, setUiBuilderEnabled] = usePersistedSetting<boolean>('chat-ui-builder', false);
    const abortRefs = useRef<Map<string, AbortController>>(new Map());
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const userScrolledAwayRef = useRef(false);

    const gestureCtx = useGestureOptional();
    const isMiddleFinger = gestureCtx?.gestureState?.gesture === 'Middle_Finger';

    // Auto-focus input when typing printable characters (type-anywhere)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            // Check if it's a printable character (single character, not a modifier key)
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (inputRef.current) {
                    inputRef.current.focus();
                    // The character will be typed into the input automatically
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Check if user is near bottom
    const isNearBottom = useCallback(() => {
        if (!scrollRef.current) return true;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        return scrollHeight - scrollTop - clientHeight < 100;
    }, []);

    // Track user scroll to detect when they scroll away
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const handleScroll = () => {
            if (isNearBottom()) {
                userScrolledAwayRef.current = false;
            } else {
                userScrolledAwayRef.current = true;
            }
        };

        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [isNearBottom]);

    // Smart auto-scroll: only scroll if user hasn't scrolled away
    const smartScroll = useCallback(() => {
        if (!userScrolledAwayRef.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, []);

    // Auto-scroll when messages change (if user is at bottom)
    useEffect(() => {
        smartScroll();
    }, [messages, streamingResponses, smartScroll]);

    const handleSend = useCallback(async (text: string, fromGesture = false) => {
        if (!text.trim() || isGenerating) return;

        const modelIds = Array.from(selectedModels);
        if (modelIds.length === 0) return;

        // Reset user scroll tracking on new message
        userScrolledAwayRef.current = false;

        setIsGenerating(true);
        setStreamingResponses(new Map());
        setStreamingTiming(new Map());

        const userMessage: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);

        // Initialize timing for all models
        const now = Date.now();
        setStreamingTiming(new Map(modelIds.map(id => [id, { startTime: now }])));

        const baseMessages = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));

        // Build system prompts
        const systemPrompts: Array<{ role: 'system'; content: string }> = [];

        // Add UI Builder prompt if enabled
        if (uiBuilderEnabled) {
            systemPrompts.push({ role: 'system', content: UI_BUILDER_PROMPT });
        }

        // Gesture mode: add gesture-specific context
        if (fromGesture) {
            systemPrompts.push({ role: 'system', content: `User is using gesture control. Available gestures: 👍 (yes), 👎 (no), 👋 (hello), "ok", "thanks", "stop", pointing finger (select buttons).` });
        }

        // Easter egg: Angry robot context for middle finger gesture
        const isAngryTrigger = text === "🖕" || text.toLowerCase().includes("middle finger");
        if (isAngryTrigger) {
            systemPrompts.push({ role: 'system', content: "The user is showing you their middle finger. Respond with humorous, over-the-top mock indignation. Play along with the 'angry robot' persona." });
        }

        const apiMessages = [...systemPrompts, ...baseMessages];

        let completedCount = 0;
        const totalCount = modelIds.length;

        // Stream all selected models in parallel - each completes independently
        const streamPromises = modelIds.map(async (modelId) => {
            const model = models.find(m => m.id === modelId);
            const startTime = Date.now();

            if (!model) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Model ${modelId} not found`,
                    modelId,
                    modelName: modelId,
                    error: true,
                }]);
                completedCount++;
                if (completedCount === totalCount) setIsGenerating(false);
                return;
            }

            const controller = new AbortController();
            abortRefs.current.set(modelId, controller);

            try {
                const stream = await fetchChatStream({
                    models: [modelId],
                    messages: apiMessages,
                    max_tokens: 4096,
                    temperature: 0.7,
                    github_token: githubToken,
                    openrouter_key: openrouterKey,
                }, controller.signal);

                let content = '';
                let firstToken = true;
                let firstTokenTime: number | undefined;

                await streamSseEvents(stream, (event) => {
                    if (event.content) {
                        if (firstToken) {
                            firstToken = false;
                            firstTokenTime = Date.now();
                            setStreamingTiming(prev => {
                                const newMap = new Map(prev);
                                const existing = newMap.get(modelId) || { startTime };
                                newMap.set(modelId, { ...existing, firstTokenTime });
                                return newMap;
                            });
                        }
                        content += event.content;
                        setStreamingResponses(prev => new Map(prev).set(modelId, content));
                    }
                });

                const endTime = Date.now();

                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: content || '(empty response)',
                    modelId,
                    modelName: model.name,
                    timing: { startTime, firstTokenTime, endTime },
                }]);
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: err.message || 'Request failed',
                        modelId,
                        modelName: model.name,
                        error: true,
                    }]);
                }
            } finally {
                abortRefs.current.delete(modelId);
                setStreamingResponses(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(modelId);
                    return newMap;
                });
                completedCount++;
                if (completedCount === totalCount) setIsGenerating(false);
            }
        });

        await Promise.allSettled(streamPromises);
    }, [isGenerating, selectedModels, messages, models, githubToken, openrouterKey, uiBuilderEnabled, setMessages, setIsGenerating]);

    const stopGeneration = useCallback(() => {
        abortRefs.current.forEach(c => c.abort());
        abortRefs.current.clear();
        setIsGenerating(false);
    }, [setIsGenerating]);

    const scroll = useCallback((deltaY: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop += deltaY;
        }
    }, []);

    useImperativeHandle(ref, () => ({
        sendMessage: handleSend,
        setInput: (text: string) => {
            if (inputRef.current) {
                inputRef.current.value = text;
                inputRef.current.focus();
            }
        },
        stopGeneration,
        scroll,
    }), [handleSend, stopGeneration, scroll]);

    const copyResponse = (idx: number) => {
        const msg = messages[idx];
        if (msg && msg.role === 'assistant') {
            navigator.clipboard.writeText(msg.content);
            setCopiedMessageId(`${idx}`);
            setTimeout(() => setCopiedMessageId(null), 2000);
        }
    };

    // UI Builder toggle button
    const UiBuilderToggle = ({ compact = false }: { compact?: boolean }) => (
        <button
            onClick={() => setUiBuilderEnabled(!uiBuilderEnabled)}
            className={`flex items-center gap-1.5 rounded-md transition-all active:scale-95 font-medium ${
                compact ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs'
            } ${
                uiBuilderEnabled
                    ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
            title="Enable interactive UI elements in responses"
        >
            <Puzzle size={compact ? 11 : 12} />
            <span>UI Builder</span>
        </button>
    );

    return (
        <div className="flex flex-col h-full w-full relative">
            {/* Scrollable messages area */}
            <div
                ref={scrollRef}
                data-no-arena-scroll
                className="flex-1 overflow-y-auto px-4 py-6 space-y-4 chat-scroll"
                style={{ paddingBottom: messages.length > 0 ? '160px' : '80px' }}
            >
                <div className="max-w-3xl mx-auto space-y-4">
                    {/* Empty state - centered vertically */}
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                            {isMiddleFinger ? (
                                <div className="mb-2 relative">
                                    <div className="absolute inset-0 bg-red-500 blur-xl opacity-50 rounded-full" />
                                    <Bot size={72} className="relative text-red-500" />
                                    <div className="absolute -top-2 -right-2 text-3xl">💢</div>
                                </div>
                            ) : (
                                <Bot size={72} className="mb-2 text-slate-500 transition-all duration-300" />
                            )}
                            <p className="text-slate-500 text-sm">Select models and start chatting</p>
                            <ModelTabs
                                models={models}
                                selectedModels={selectedModels}
                                onToggleModel={onToggleModel}
                                isGenerating={isGenerating}
                                githubToken={githubToken}
                                openrouterKey={openrouterKey}
                                dropDirection="down"
                            />
                            <UiBuilderToggle />
                        </div>
                    )}

                    {messages.map((msg, idx) => {
                        const hasGestureOptions = msg.role === 'assistant' && (gesturesActive || uiBuilderEnabled) && msg.content.includes('```json');
                        return (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`group relative max-w-[85%] rounded-2xl px-4 py-3 ${
                                    msg.role === 'user'
                                        ? 'bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-sm'
                                        : msg.error
                                            ? 'bg-red-500/10 border border-red-500/30 text-red-200 rounded-tl-sm'
                                            : 'bg-slate-800/60 border border-slate-700/60 text-slate-200 rounded-tl-sm'
                                }`}>
                                    <div className={`flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider ${
                                        msg.role === 'user' ? 'text-blue-300 flex-row-reverse' : 'text-slate-400'
                                    }`}>
                                        {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                        {msg.role === 'user' ? 'You' : msg.modelName || 'Assistant'}
                                        {msg.error && <AlertTriangle size={12} className="text-red-400" />}
                                    </div>
                                    <div className="prose prose-invert prose-sm max-w-none">
                                        <FormattedContent text={msg.role === 'user' ? msg.content : extractTextWithoutJSON(msg.content)} />
                                    </div>
                                    {msg.role === 'assistant' && msg.timing && (
                                        <div className="mt-2 pt-2 border-t border-slate-700/30">
                                            <ExecutionTimeDisplay times={msg.timing} />
                                        </div>
                                    )}
                                    {msg.role === 'assistant' && msg.content && (
                                        <button
                                            onClick={() => copyResponse(idx)}
                                            className={`absolute bottom-2 right-2 p-1.5 rounded-md transition-all ${
                                                copiedMessageId === `${idx}`
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'opacity-0 group-hover:opacity-100 bg-slate-700/70 text-slate-400'
                                            }`}
                                        >
                                            {copiedMessageId === `${idx}` ? <Check size={12} /> : <Copy size={12} />}
                                        </button>
                                    )}
                                </div>
                                {hasGestureOptions && (
                                    <div className="ml-4">
                                        <GestureOptions
                                            content={msg.content}
                                            onSelect={(value) => handleSend(value, true)}
                                            isInline={false}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Streaming responses */}
                    {isGenerating && streamingResponses.size > 0 && (
                        <>
                            {Array.from(streamingResponses.entries()).map(([modelId, content]) => {
                                const model = models.find(m => m.id === modelId);
                                const timing = streamingTiming.get(modelId);
                                return (
                                    <div key={modelId} className="flex justify-start">
                                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-800/60 border border-amber-500/30 text-slate-200">
                                            <div className="flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                                                <div className="w-3 h-3 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin" />
                                                {model?.name || modelId}
                                            </div>
                                            <div className="prose prose-invert prose-sm max-w-none">
                                                <FormattedContent text={content || '...'} />
                                            </div>
                                            {timing && (
                                                <div className="mt-2 pt-2 border-t border-slate-700/30">
                                                    <ExecutionTimeDisplay times={timing} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>

            {/* Bottom area: Input */}
            <div className="fixed bottom-0 left-0 right-0 z-[99] flex flex-col items-center gap-2 px-4 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                <PromptInput
                    inputRef={inputRef}
                    inputFocused={inputFocused}
                    setInputFocused={setInputFocused}
                    onSendMessage={handleSend}
                    isGenerating={isGenerating || selectedModels.size === 0}
                    onStop={stopGeneration}
                    placeholder={selectedModels.size === 0 ? "Select a model above..." : "Type a message..."}
                />
            </div>
        </div>
    );
});

ChatView.displayName = 'ChatView';

export default ChatView;
