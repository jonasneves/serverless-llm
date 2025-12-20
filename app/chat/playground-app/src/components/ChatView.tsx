import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User } from 'lucide-react';
import { useListSelectionBox } from '../hooks/useListSelectionBox';
import { useSmartModelSelection } from '../hooks/useSmartModelSelection';
import SelectionOverlay from './SelectionOverlay';
import { extractTextWithoutJSON } from '../hooks/useGestureOptions';
import GestureOptions from './GestureOptions';
import { fetchChatStream, streamSseEvents } from '../utils/streaming';
import ModelSelector from './ModelSelector';


export interface ChatViewHandle {
    sendMessage: (text: string, fromGesture?: boolean) => void;
    setInput: (text: string) => void;
    stopGeneration: () => void;
    scroll: (deltaY: number) => void;
}

export type ChatAutoModeScope = 'local' | 'api';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    modelName?: string;
    modelId?: string;
    error?: boolean;
}

interface ChatViewProps {
    models: Model[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    githubToken?: string;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    autoMode: boolean;
    setAutoMode: (value: boolean) => void;
    autoModeScope: ChatAutoModeScope;
    setAutoModeScope: (value: ChatAutoModeScope) => void;
    currentResponse: string;
    setCurrentResponse: React.Dispatch<React.SetStateAction<string>>;
    isGenerating: boolean;
    setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
    onModelUsed?: (modelId: string) => void;
    gesturesActive?: boolean;
}

// ChatMessage interface moved above ChatViewProps for export

const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(({
    models,
    selectedModelId,
    onSelectModel,
    githubToken,
    messages,
    setMessages,
    autoMode,
    setAutoMode,
    autoModeScope,
    setAutoModeScope,
    currentResponse,
    setCurrentResponse,
    isGenerating,
    setIsGenerating,
    onModelUsed,
    gesturesActive = false,
}, ref) => {
    const [inputFocused, setInputFocused] = useState(false);
    const [currentAutoModel, setCurrentAutoModel] = useState<string | null>(null);
    const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
    const abortControllerRef = useRef<AbortController | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // Smart model selection hook
    const { sortModels, recordRateLimit, recordSuccess } = useSmartModelSelection();

    // Gesture scrolling state
    const userScrolledAwayRef = useRef(false);

    // Clamp scroll position to valid bounds
    const clampScroll = (value: number) => {
        if (!scrollRef.current) return value;
        const maxScroll = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
        return Math.max(0, Math.min(maxScroll, value));
    };

    // Check if user is near bottom (for auto-scroll behavior)
    const isNearBottom = () => {
        if (!scrollRef.current) return true;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        return scrollHeight - scrollTop - clientHeight < 100;
    };

    useImperativeHandle(ref, () => ({
        sendMessage: (text: string, fromGesture?: boolean) => {
            // Don't populate input box for programmatic sends (e.g., gesture-triggered)
            // Just send the message directly
            handleSend(text, fromGesture);
        },
        setInput: (text: string) => {
            if (inputRef.current) {
                inputRef.current.value = text;
                inputRef.current.focus();
            }
        },
        stopGeneration: () => {
            handleStop();
        },
        scroll: (deltaY: number) => {
            if (scrollRef.current) {
                // Mark that user is manually scrolling (unlocks from auto-follow)
                userScrolledAwayRef.current = true;

                // Direct scroll with native smoothing
                const currentScroll = scrollRef.current.scrollTop;
                const newScroll = clampScroll(currentScroll - deltaY);
                scrollRef.current.scrollTop = newScroll;
            }
        }
    }));

    // Use list selection box hook for drag selection
    const { selectionRect } = useListSelectionBox({
        containerRef: containerRef,
        itemRefs: messageRefs,
        setSelectedIndices: setSelectedMessages,
    });

    // Auto-scroll to bottom when new content arrives (unless user scrolled away)
    useEffect(() => {
        if (scrollRef.current && !userScrolledAwayRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, currentResponse, isGenerating]);

    // Re-enable auto-scroll when user scrolls back to bottom
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const handleScroll = () => {
            // If user scrolled back near bottom, re-enable auto-follow
            if (isNearBottom()) {
                userScrolledAwayRef.current = false;
            }
        };

        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, []);

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

    // Handle keyboard shortcuts (Delete/Backspace, Escape, Cmd+A)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Select All (Cmd+A / Ctrl+A)
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                const target = e.target as HTMLElement;
                // Allow default behavior in inputs
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

                e.preventDefault();
                // Select all messages (indices 0 to messages.length - 1)
                const allIndices = new Set(messages.map((_, idx) => idx));
                setSelectedMessages(allIndices);
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedMessages.size > 0) {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
                    e.preventDefault();
                    handleDeleteSelected();
                }
            } else if (e.key === 'Escape') {
                setSelectedMessages(new Set());
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMessages, messages]);


    const tryModelStream = async (modelId: string, apiMessages: any[]): Promise<{ success: boolean; content: string; isRateLimit?: boolean }> => {
        try {
            const stream = await fetchChatStream({
                models: [modelId],
                messages: apiMessages.map(m => ({ role: m.role, content: m.content })),
                max_tokens: 2048,
                temperature: 0.7,
                github_token: githubToken || null,
            }, abortControllerRef.current?.signal);

            let responseContent = '';

            await streamSseEvents(stream, (event) => {
                // Check for abort
                if (abortControllerRef.current?.signal.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }

                if ((event.event === 'token' || event.content) && event.content) {
                    responseContent += event.content;
                    setCurrentResponse(prev => prev + event.content);
                } else if (event.event === 'error' || event.error) {
                    const errorMsg = String(event.error || 'Stream failed');
                    const isRateLimit = errorMsg.includes('429') ||
                        errorMsg.toLowerCase().includes('rate limit') ||
                        errorMsg.toLowerCase().includes('too many requests');
                    if (isRateLimit) {
                        recordRateLimit(modelId);
                    }
                    throw new Error(errorMsg);
                }
            });

            recordSuccess(modelId);
            return { success: true, content: responseContent };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw error;
            }
            const isRateLimit = error.message?.includes('429') ||
                error.message?.toLowerCase().includes('rate limit');
            if (isRateLimit) {
                recordRateLimit(modelId);
            }
            return { success: false, content: error.message, isRateLimit };
        }
    };

    const handleSend = async (text: string, fromGesture: boolean = false) => {
        if (!text.trim() || isGenerating) return;
        if (!autoMode && !selectedModelId) return;

        const userMessage: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setIsGenerating(true);
        setCurrentResponse('');

        abortControllerRef.current = new AbortController();

        try {
            // Prepend gesture mode context as system message if from gesture
            const gestureSystemMessage = fromGesture ? {
                role: 'system' as const,
                content: 'User is hands-free using gesture control. Build an interactive interface to guide them.\n\nAvailable gesture inputs:\n- 👍 (yes/approve/like)\n- 👎 (no/disapprove/dislike)\n- 👋 (hi/hello/greeting)\n- "ok" (okay/continue)\n- "thanks" (thank you)\n- "stop" (stop/wait)\n- Pointing finger (select UI buttons)\n\nChoose interaction style:\n- Simple binary: "Give 👍 to continue or 👎 to stop" (no JSON needed)\n- Complex choices: Use JSON UI buttons (3+ options, or multi-word responses needed)\n\nFor JSON UI (when appropriate):\n```json\n{\n  "options": [\n    {"id": "opt1", "label": "Option 1", "action": "message", "value": "option 1"},\n    {"id": "opt2", "label": "Option 2", "action": "message", "value": "option 2"}\n  ]\n}\n```\n\nGuidelines:\n- Keep response concise (2-3 sentences)\n- Use simple gestures for yes/no/continue (more efficient)\n- Use JSON UI for 3+ options or complex choices\n- Provide 2-4 options max in JSON\n- User can point at buttons with index finger'
            } : null;

            const baseMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content
            }));

            const apiMessages = gestureSystemMessage
                ? [gestureSystemMessage, ...baseMessages]
                : baseMessages;

            if (autoMode) {
                // Filter models based on scope, with fallback to other type
                const primaryModels = models.filter(m => {
                    if (autoModeScope === 'local') return m.type === 'local';
                    if (autoModeScope === 'api') return m.type === 'api';
                    return true;
                });

                const fallbackModels = models.filter(m => {
                    if (autoModeScope === 'local') return m.type === 'api';
                    if (autoModeScope === 'api') return m.type === 'local';
                    return false;
                });

                const sortedPrimary = sortModels(primaryModels);
                const sortedFallback = sortModels(fallbackModels);

                let lastError: string | null = null;
                let triedFallback = false;

                // Try primary models first
                for (const model of sortedPrimary) {
                    setCurrentAutoModel(model.id);
                    setCurrentResponse('');

                    const result = await tryModelStream(model.id, apiMessages);

                    if (result.success) {
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: result.content,
                            modelName: model.name,
                            modelId: model.id
                        }]);
                        setCurrentResponse('');
                        setCurrentAutoModel(null);
                        onModelUsed?.(model.id);
                        return;
                    }

                    lastError = result.content;
                }

                // If all primary models failed, try fallback models
                if (sortedFallback.length > 0) {
                    triedFallback = true;
                    for (const model of sortedFallback) {
                        setCurrentAutoModel(model.id);
                        setCurrentResponse('');

                        const result = await tryModelStream(model.id, apiMessages);

                        if (result.success) {
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: result.content,
                                modelName: model.name,
                                modelId: model.id
                            }]);
                            setCurrentResponse('');
                            setCurrentAutoModel(null);
                            onModelUsed?.(model.id);
                            return;
                        }

                        lastError = result.content;
                    }
                }

                const errorMsg = triedFallback
                    ? `All models failed to respond. Last error: ${lastError}`
                    : `All ${autoModeScope} models failed to respond. Last error: ${lastError}`;

                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: errorMsg,
                    error: true
                }]);
                setCurrentAutoModel(null);
            } else {
                if (!selectedModelId) return;
                const model = models.find(m => m.id === selectedModelId);
                const result = await tryModelStream(selectedModelId, apiMessages);

                if (result.success) {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: result.content,
                        modelName: model?.name,
                        modelId: selectedModelId
                    }]);
                    // Notify parent about the model used (for mode switching)
                    onModelUsed?.(selectedModelId);
                } else {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: result.content,
                        modelName: model?.name,
                        error: true
                    }]);
                }
            }

            setCurrentResponse('');

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                setMessages(prev => [...prev, { role: 'assistant', content: error.message, error: true }]);
            }
        } finally {
            setIsGenerating(false);
            setCurrentAutoModel(null);
            abortControllerRef.current = null;
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsGenerating(false);
            if (currentResponse) {
                setMessages(prev => [...prev, { role: 'assistant', content: currentResponse }]);
                setCurrentResponse('');
            }
        }
    };



    const handleDeleteSelected = () => {
        if (selectedMessages.size === 0) return;
        setMessages(prev => prev.filter((_, index) => !selectedMessages.has(index)));
        setSelectedMessages(new Set());
    };

    const selectedModel = models.find(m => m.id === selectedModelId);
    const displayModel = autoMode && currentAutoModel
        ? models.find(m => m.id === currentAutoModel)
        : selectedModel;

    return (
        <div ref={containerRef} className="flex flex-col h-full relative isolate z-[10]">
            {/* Blue Selection Rectangle */}
            <SelectionOverlay rect={selectionRect} />

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 pb-32 chat-scroll relative z-[10] [mask-image:linear-gradient(to_bottom,transparent_0%,black_2rem,black_calc(100%-4rem),transparent_100%)]"
                data-no-arena-scroll
                onClick={(e) => {
                    // Clear selection if clicking directly on the messages area (not on a message)
                    if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('[data-message]')) {
                        setSelectedMessages(new Set());
                    }
                }}
            >
                <div className="mx-auto w-full min-h-full flex flex-col space-y-6" style={{ maxWidth: '600px' }}>
                    {messages.length === 0 && (
                        <div className="flex-1 flex flex-col items-center text-slate-500 select-none pb-20 relative pt-[30vh]">
                            <Bot size={48} className="mb-4 opacity-50" />

                            {/* Model Selection Controls */}
                            <div className="flex flex-col items-center gap-2 mb-4 sticky top-4 z-30">
                                {/* Unified Mode Toggle */}
                                <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 backdrop-blur-sm">
                                    <button
                                        onClick={() => {
                                            setAutoMode(true);
                                            setAutoModeScope('local');
                                        }}
                                        className={`h-7 px-3 flex items-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
                                            autoMode && autoModeScope === 'local'
                                                ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-300'
                                        }`}
                                    >
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>Local</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setAutoMode(true);
                                            setAutoModeScope('api');
                                        }}
                                        className={`h-7 px-3 flex items-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
                                            autoMode && autoModeScope === 'api'
                                                ? 'bg-blue-500/20 text-blue-300 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-300'
                                        }`}
                                    >
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        <span>API</span>
                                    </button>
                                    <button
                                        onClick={() => setAutoMode(false)}
                                        className={`h-7 px-3 flex items-center gap-1.5 rounded-md transition-all active:scale-95 text-xs font-medium whitespace-nowrap ${
                                            !autoMode
                                                ? 'bg-slate-600/40 text-slate-200 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-300'
                                        }`}
                                    >
                                        <Bot size={12} />
                                        <span>Manual</span>
                                    </button>
                                </div>

                                {/* Model Selector - only shown in Manual mode */}
                                {!autoMode && (
                                    <ModelSelector
                                        models={models}
                                        selectedModelId={selectedModelId}
                                        onSelectModel={onSelectModel}
                                        isGenerating={isGenerating}
                                    />
                                )}
                            </div>

                            {!githubToken && ((!autoMode && selectedModel?.type === 'api') || (autoMode && autoModeScope === 'api')) && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
                                    <AlertTriangle size={11} className="shrink-0 text-yellow-500" />
                                    <span>Add GitHub token in Settings for dedicated quota</span>
                                </div>
                            )}
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div
                            key={idx}
                            ref={(el) => {
                                if (el) messageRefs.current.set(idx, el);
                                else messageRefs.current.delete(idx);
                            }}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            data-message={idx}
                            onClick={(e) => {
                                // Only handle direct clicks, not bubbled clicks from children
                                if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-message]') === e.currentTarget) {
                                    setSelectedMessages(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(idx)) {
                                            newSet.delete(idx);
                                        } else {
                                            newSet.add(idx);
                                        }
                                        return newSet;
                                    });
                                }
                            }}
                        >
                            <div className={`max-w-[85%] rounded-2xl px-4 pt-3 pb-0 select-none transition-all cursor-pointer ${selectedMessages.has(idx)
                                ? 'ring-2 ring-blue-500 bg-blue-500/10'
                                : ''
                                } ${msg.role === 'user'
                                    ? 'bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-sm'
                                    : msg.error
                                        ? 'bg-red-500/10 border border-red-500/30 text-red-200 rounded-tl-sm'
                                        : 'bg-slate-800/60 border border-slate-700/60 text-slate-200 rounded-tl-sm'
                                }`}>
                                <div className={`flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider ${msg.role === 'user' ? 'text-blue-300 flex-row-reverse' : 'text-slate-400'}`}>
                                    {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                    {msg.role === 'user' ? 'You' : (msg.modelName || 'Assistant')}
                                    {msg.error && <AlertTriangle size={12} className="text-red-400" />}
                                </div>
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <FormattedContent text={msg.role === 'user' ? msg.content : extractTextWithoutJSON(msg.content)} />
                                </div>
                                {msg.role === 'assistant' && gesturesActive && msg.content.includes('```json') && (
                                    <GestureOptions
                                        content={msg.content}
                                        onSelect={(value) => handleSend(value, true)}
                                        isInline={true}
                                    />
                                )}
                            </div>
                        </div>
                    ))}

                    {isGenerating && (
                        <div className="flex justify-start">
                            <div
                                className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 pt-3 pb-0 text-slate-200 relative"
                                style={{
                                    background: 'rgba(30, 41, 59, 0.8)',
                                    border: '1px solid rgba(251, 191, 36, 0.4)',
                                    boxShadow: '0 0 20px rgba(251, 191, 36, 0.15), inset 0 0 30px rgba(251, 191, 36, 0.03)'
                                }}
                            >
                                <div className="flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                                    {/* Spinning indicator */}
                                    <div className="relative flex items-center justify-center" style={{ width: '14px', height: '14px' }}>
                                        <svg
                                            width={14}
                                            height={14}
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            style={{
                                                filter: 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.55))',
                                                animation: 'spin 0.6s linear infinite'
                                            }}
                                        >
                                            <defs>
                                                <linearGradient id="chatSpinnerGradient" gradientUnits="userSpaceOnUse" x1="3" y1="12" x2="12" y2="3">
                                                    <stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
                                                    <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.5" />
                                                    <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                            <circle cx="12" cy="12" r="9" stroke="rgba(251, 191, 36, 0.15)" strokeWidth="2" fill="none" />
                                            <path d="M 12 3 A 9 9 0 1 1 3 12" stroke="url(#chatSpinnerGradient)" strokeWidth="2" strokeLinecap="round" fill="none" />
                                            <circle cx="3" cy="12" r="1.4" fill="#fbbf24" />
                                        </svg>
                                    </div>
                                    {displayModel?.name || 'Assistant'}
                                </div>
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <FormattedContent text={currentResponse} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <PromptInput
                inputRef={inputRef}
                inputFocused={inputFocused}
                setInputFocused={setInputFocused}
                onSendMessage={handleSend}
                placeholder={autoMode ? "Message (Auto mode - will use auto-selected model)..." : (selectedModel ? `Message ${selectedModel.name}...` : "Select a model from the dock to start chatting...")}
                isGenerating={isGenerating}
                onStop={handleStop}
                className="fixed bottom-0 left-0 right-0 z-[100] pb-6 px-3 sm:px-4 flex justify-center items-end pointer-events-none transition-all duration-300"
                style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            />
        </div>
    );
});

export default ChatView;
