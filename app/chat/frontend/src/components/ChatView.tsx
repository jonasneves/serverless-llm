import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User, Check, Copy, ChevronDown, Settings2 } from 'lucide-react';
import { extractTextWithoutJSON } from '../hooks/useGestureOptions';
import GestureOptions from './GestureOptions';
import { fetchChatStream, streamSseEvents } from '../utils/streaming';
import ModelTabs from './ModelTabs';
import { useGestureOptional } from '../context/GestureContext';
import ExecutionTimeDisplay, { ExecutionTimeData } from './ExecutionTimeDisplay';
import { usePersistedSetting } from '../hooks/usePersistedSetting';

// System prompt presets
export const SYSTEM_PRESETS = {
    none: {
        id: 'none',
        name: 'None',
        description: 'No system prompt',
        prompt: null,
    },
    ui_builder: {
        id: 'ui_builder',
        name: 'UI Builder',
        description: 'Interactive JSON buttons for gesture control',
        prompt: `You can output interactive UI elements using JSON. When appropriate, include clickable options:

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
- Include JSON after your text response`,
    },
    concise: {
        id: 'concise',
        name: 'Concise',
        description: 'Brief, direct responses',
        prompt: 'Be concise. Give direct answers without unnecessary elaboration. Use bullet points for lists. Skip pleasantries.',
    },
    technical: {
        id: 'technical',
        name: 'Technical',
        description: 'Detailed technical explanations',
        prompt: 'Provide detailed technical explanations. Include code examples where relevant. Explain tradeoffs and edge cases. Assume technical proficiency.',
    },
    creative: {
        id: 'creative',
        name: 'Creative',
        description: 'More expressive and creative responses',
        prompt: 'Be creative and expressive. Use analogies and metaphors. Explore ideas freely. Personality is encouraged.',
    },
} as const;

export type SystemPresetId = keyof typeof SYSTEM_PRESETS;

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

// System preset dropdown component
function SystemPresetDropdown({
    systemPreset,
    setSystemPreset,
    showDropdown,
    setShowDropdown,
    showPreview,
    setShowPreview,
    dropdownRef,
    direction = 'down',
    compact = false,
}: {
    systemPreset: SystemPresetId;
    setSystemPreset: (id: SystemPresetId) => void;
    showDropdown: boolean;
    setShowDropdown: (show: boolean) => void;
    showPreview: boolean;
    setShowPreview: (show: boolean) => void;
    dropdownRef: React.RefObject<HTMLDivElement>;
    direction?: 'up' | 'down';
    compact?: boolean;
}) {
    const preset = SYSTEM_PRESETS[systemPreset];
    const presetIds = Object.keys(SYSTEM_PRESETS) as SystemPresetId[];

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
                setShowPreview(false);
            }
        };
        if (showDropdown || showPreview) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showDropdown, showPreview, dropdownRef, setShowDropdown, setShowPreview]);

    return (
        <div className={`relative ${compact ? '' : 'mt-3'}`} ref={dropdownRef}>
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`flex items-center gap-1.5 rounded-md transition-all active:scale-95 font-medium ${
                    compact ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs'
                } ${
                    systemPreset !== 'none'
                        ? 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
                        : 'bg-slate-800/60 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                }`}
            >
                <Settings2 size={compact ? 11 : 12} />
                <span>System: {preset.name}</span>
                <ChevronDown size={compact ? 10 : 12} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDropdown && (
                <div className={`absolute ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} left-1/2 -translate-x-1/2 min-w-[200px] bg-slate-800/95 backdrop-blur-md rounded-lg border border-slate-700/50 shadow-xl overflow-hidden z-50`}>
                    {presetIds.map(id => {
                        const p = SYSTEM_PRESETS[id];
                        const isSelected = id === systemPreset;
                        return (
                            <div key={id} className="relative group">
                                <button
                                    onClick={() => {
                                        setSystemPreset(id);
                                        setShowDropdown(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                                        isSelected
                                            ? 'bg-sky-500/20 text-sky-300'
                                            : 'text-slate-300 hover:bg-slate-700/50'
                                    }`}
                                >
                                    <div>
                                        <div className="font-medium">{p.name}</div>
                                        <div className="text-[10px] text-slate-500">{p.description}</div>
                                    </div>
                                    {isSelected && <Check size={12} className="text-sky-400" />}
                                </button>
                            </div>
                        );
                    })}
                    {/* Preview toggle */}
                    {preset.prompt && (
                        <div className="border-t border-slate-700/50">
                            <button
                                onClick={() => setShowPreview(!showPreview)}
                                className="w-full px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-400 text-left"
                            >
                                {showPreview ? '▼ Hide prompt' : '▶ Show prompt'}
                            </button>
                            {showPreview && (
                                <div className="px-3 pb-2 text-[10px] text-slate-400 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                                    {preset.prompt}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
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
    const [systemPreset, setSystemPreset] = usePersistedSetting<SystemPresetId>('chat-system-preset', 'none');
    const [showPresetDropdown, setShowPresetDropdown] = useState(false);
    const [showPresetPreview, setShowPresetPreview] = useState(false);
    const presetDropdownRef = useRef<HTMLDivElement>(null);
    const abortRefs = useRef<Map<string, AbortController>>(new Map());
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const userScrolledAwayRef = useRef(false);

    const gestureCtx = useGestureOptional();
    const isMiddleFinger = gestureCtx?.gestureState?.gesture === 'Middle_Finger';

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

    useImperativeHandle(ref, () => ({
        sendMessage: (text: string, fromGesture?: boolean) => handleSend(text, fromGesture),
        setInput: (text: string) => {
            if (inputRef.current) {
                inputRef.current.value = text;
                inputRef.current.focus();
            }
        },
        stopGeneration: handleStop,
        scroll: (deltaY: number) => {
            if (scrollRef.current) {
                userScrolledAwayRef.current = true;
                scrollRef.current.scrollTop = scrollRef.current.scrollTop - deltaY;
            }
        }
    }));

    // Auto-scroll to bottom only if user hasn't scrolled away
    useEffect(() => {
        if (scrollRef.current && !userScrolledAwayRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, streamingResponses]);

    // Auto-focus on keydown
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
            if (e.key.length === 1) inputRef.current?.focus();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSend = async (text: string, fromGesture = false) => {
        if (!text.trim() || isGenerating || selectedModels.size === 0) return;

        // Reset scroll tracking so new responses auto-scroll
        userScrolledAwayRef.current = false;

        const modelIds = Array.from(selectedModels);
        const userMessage: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setIsGenerating(true);
        setStreamingResponses(new Map(modelIds.map(id => [id, ''])));

        // Initialize timing for all models
        const now = Date.now();
        setStreamingTiming(new Map(modelIds.map(id => [id, { startTime: now }])));

        const baseMessages = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));

        // Build system prompts from preset + special cases
        const systemPrompts: Array<{ role: 'system'; content: string }> = [];

        // Add selected preset's system prompt
        const preset = SYSTEM_PRESETS[systemPreset];
        if (preset.prompt) {
            systemPrompts.push({ role: 'system', content: preset.prompt });
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
                // Immediately add error message and remove from streaming
                setMessages(prev => [...prev, {
                    role: 'assistant' as const,
                    content: 'Model not found',
                    modelName: modelId,
                    modelId,
                    error: true
                }]);
                setStreamingResponses(prev => {
                    const next = new Map(prev);
                    next.delete(modelId);
                    return next;
                });
                setStreamingTiming(prev => {
                    const next = new Map(prev);
                    next.delete(modelId);
                    return next;
                });
                completedCount++;
                if (completedCount === totalCount) setIsGenerating(false);
                return;
            }

            const abortController = new AbortController();
            abortRefs.current.set(modelId, abortController);
            let firstTokenTime: number | undefined;

            try {
                const stream = await fetchChatStream({
                    models: [modelId],
                    messages: apiMessages,
                    max_tokens: 2048,
                    temperature: 0.7,
                    github_token: githubToken || null,
                    openrouter_key: openrouterKey || null,
                }, abortController.signal);

                let content = '';
                await streamSseEvents(stream, (event) => {
                    if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                    if (event.event === 'error' || event.error) {
                        throw new Error(typeof event.error === 'string' ? event.error : event.content || 'Stream failed');
                    }
                    if (event.content) {
                        // Track first token time
                        if (!firstTokenTime) {
                            firstTokenTime = Date.now();
                            setStreamingTiming(prev => {
                                const next = new Map(prev);
                                const current = next.get(modelId);
                                if (current) next.set(modelId, { ...current, firstTokenTime });
                                return next;
                            });
                        }
                        content += event.content;
                        setStreamingResponses(prev => new Map(prev).set(modelId, content));
                    }
                });

                const endTime = Date.now();
                // Model completed successfully - add message with timing
                setMessages(prev => [...prev, {
                    role: 'assistant' as const,
                    content,
                    modelName: model.name,
                    modelId,
                    timing: { startTime, firstTokenTime, endTime }
                }]);
            } catch (error: any) {
                const endTime = Date.now();
                if (error.name !== 'AbortError') {
                    // Error - add error message with timing
                    setMessages(prev => [...prev, {
                        role: 'assistant' as const,
                        content: error.message,
                        modelName: model.name,
                        modelId,
                        error: true,
                        timing: { startTime, firstTokenTime, endTime }
                    }]);
                }
            } finally {
                abortRefs.current.delete(modelId);
                setStreamingResponses(prev => {
                    const next = new Map(prev);
                    next.delete(modelId);
                    return next;
                });
                setStreamingTiming(prev => {
                    const next = new Map(prev);
                    next.delete(modelId);
                    return next;
                });
                completedCount++;
                if (completedCount === totalCount) setIsGenerating(false);
            }
        });

        await Promise.all(streamPromises);
    };

    const handleStop = () => {
        abortRefs.current.forEach(c => c.abort());
        abortRefs.current.clear();

        // Save partial responses with timing
        const partial: ChatMessage[] = [];
        const endTime = Date.now();
        streamingResponses.forEach((content, modelId) => {
            if (content.trim()) {
                const model = models.find(m => m.id === modelId);
                const timing = streamingTiming.get(modelId);
                partial.push({
                    role: 'assistant',
                    content,
                    modelName: model?.name,
                    modelId,
                    timing: timing ? { ...timing, endTime } : undefined
                });
            }
        });
        if (partial.length > 0) setMessages(prev => [...prev, ...partial]);

        setStreamingResponses(new Map());
        setStreamingTiming(new Map());
        setIsGenerating(false);
    };

    const copyResponse = useCallback(async (idx: number) => {
        const msg = messages[idx];
        if (!msg) return;
        try {
            await navigator.clipboard.writeText(msg.content);
            setCopiedMessageId(`${idx}`);
            setTimeout(() => setCopiedMessageId(null), 2000);
        } catch (e) { console.error('Copy failed', e); }
    }, [messages]);

    const placeholder = selectedModels.size === 0
        ? "Select models to start..."
        : selectedModels.size === 1
            ? `Message ${models.find(m => m.id === Array.from(selectedModels)[0])?.name || 'model'}...`
            : `Message ${selectedModels.size} models...`;

    return (
        <div className="flex flex-col h-full relative">
            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-scroll p-4 pb-40 chat-scroll"
                style={{ WebkitOverflowScrolling: 'touch' }}
                data-no-arena-scroll
            >
                <div className="mx-auto max-w-2xl space-y-4">
                    {/* Empty state with robot icon and model selector */}
                    {messages.length === 0 && (
                        <div className="flex-1 flex flex-col items-center text-slate-500 select-none pt-[15vh]">
                            {isMiddleFinger ? (
                                <div className="mb-6 relative">
                                    <div className="absolute inset-0 bg-red-500 blur-xl opacity-50 rounded-full" />
                                    <Bot size={72} className="relative text-red-500" />
                                    <div className="absolute -top-2 -right-2 text-3xl">💢</div>
                                </div>
                            ) : (
                                <Bot size={72} className="mb-6 opacity-50 transition-all duration-300" />
                            )}
                            <ModelTabs
                                models={models}
                                selectedModels={selectedModels}
                                onToggleModel={onToggleModel}
                                isGenerating={isGenerating}
                                githubToken={githubToken}
                                openrouterKey={openrouterKey}
                                dropDirection="down"
                            />
                            <SystemPresetDropdown
                                systemPreset={systemPreset}
                                setSystemPreset={setSystemPreset}
                                showDropdown={showPresetDropdown}
                                setShowDropdown={setShowPresetDropdown}
                                showPreview={showPresetPreview}
                                setShowPreview={setShowPresetPreview}
                                dropdownRef={presetDropdownRef}
                                direction="down"
                            />
                        </div>
                    )}

                    {messages.map((msg, idx) => {
                        const hasGestureOptions = msg.role === 'assistant' && (gesturesActive || systemPreset === 'ui_builder') && msg.content.includes('```json');
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

            {/* Bottom area: Model selector (when messages) + Input */}
            <div className="fixed bottom-0 left-0 right-0 z-[99] flex flex-col items-center gap-2 px-4 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                {messages.length > 0 && (
                    <div className="flex flex-col items-center gap-2">
                        <SystemPresetDropdown
                            systemPreset={systemPreset}
                            setSystemPreset={setSystemPreset}
                            showDropdown={showPresetDropdown}
                            setShowDropdown={setShowPresetDropdown}
                            showPreview={showPresetPreview}
                            setShowPreview={setShowPresetPreview}
                            dropdownRef={presetDropdownRef}
                            direction="up"
                            compact
                        />
                        <ModelTabs
                            models={models}
                            selectedModels={selectedModels}
                            onToggleModel={onToggleModel}
                            isGenerating={isGenerating}
                            githubToken={githubToken}
                            openrouterKey={openrouterKey}
                            dropDirection="up"
                        />
                    </div>
                )}
                <PromptInput
                    inputRef={inputRef}
                    inputFocused={inputFocused}
                    setInputFocused={setInputFocused}
                    onSendMessage={handleSend}
                    placeholder={placeholder}
                    isGenerating={isGenerating}
                    onStop={handleStop}
                    className="w-full flex justify-center"
                    style={{}}
                />
            </div>
        </div>
    );
});

export default ChatView;
