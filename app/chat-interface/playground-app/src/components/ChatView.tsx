import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User, Zap, ChevronDown, Info, Server, Infinity, Cloud, Sparkles } from 'lucide-react';
import { getModelPriority } from '../constants';
import { useListSelectionBox } from '../hooks/useListSelectionBox';
import SelectionOverlay from './SelectionOverlay';
import { extractTextWithoutJSON } from './GestureOptions';


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
    onOpenTopics: () => void;
    // External state management for persistence across mode switches
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    autoMode: boolean;
    setAutoMode: (value: boolean) => void;
    autoModeScope: ChatAutoModeScope;
    setAutoModeScope: (value: ChatAutoModeScope) => void;
    // Generation state - persisted across mode switches
    currentResponse: string;
    setCurrentResponse: React.Dispatch<React.SetStateAction<string>>;
    isGenerating: boolean;
    setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
    onModelUsed?: (modelId: string) => void;
    onGestureOptionsChange?: (content: string | null) => void;
}

// ChatMessage interface moved above ChatViewProps for export

const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(({
    models,
    selectedModelId,
    onSelectModel,
    githubToken,
    onOpenTopics,
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
    onGestureOptionsChange,
}, ref) => {
    const [inputFocused, setInputFocused] = useState(false);
    const [showAutoDropdown, setShowAutoDropdown] = useState(false);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [expandedLocalModels, setExpandedLocalModels] = useState(true);
    const [expandedApiModels, setExpandedApiModels] = useState(false);
    const [currentAutoModel, setCurrentAutoModel] = useState<string | null>(null);
    const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
    const [showTooltip, setShowTooltip] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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
                scrollRef.current.scrollTop += deltaY;
            }
        }
    }));

    // Use list selection box hook for drag selection
    const { selectionRect } = useListSelectionBox({
        containerRef: containerRef,
        itemRefs: messageRefs,
        setSelectedIndices: setSelectedMessages,
    });

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, currentResponse, isGenerating]);

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

    // Track gesture options from latest assistant message
    useEffect(() => {
        if (onGestureOptionsChange) {
            // Find the last assistant message with JSON options
            const lastAssistantMsg = [...messages].reverse().find(m =>
                m.role === 'assistant' && m.content.includes('```json')
            );
            onGestureOptionsChange(lastAssistantMsg?.content || null);
        }
    }, [messages, onGestureOptionsChange]);

    const tryModelStream = async (modelId: string, apiMessages: any[]): Promise<{ success: boolean; content: string }> => {
        try {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    models: [modelId],
                    messages: apiMessages,
                    max_tokens: 2048,
                    temperature: 0.7,
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
            let responseContent = '';

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
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.event === 'token' && data.content) {
                                responseContent += data.content;
                                setCurrentResponse(prev => prev + data.content);
                            } else if (data.error) {
                                throw new Error(data.content);
                            }
                        } catch (e) {
                            if (e instanceof Error && e.message !== jsonStr) {
                                throw e;
                            }
                        }
                    }
                }
            }

            return { success: true, content: responseContent };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw error;
            }
            return { success: false, content: error.message };
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
            // Determine model type for gesture context
            let modelType: 'local' | 'api' = 'local';
            if (autoMode) {
                // In auto mode, use scope directly
                modelType = autoModeScope === 'api' ? 'api' : 'local';
            } else if (selectedModelId) {
                // In manual mode, check selected model type
                const selectedModel = models.find(m => m.id === selectedModelId);
                modelType = selectedModel?.type || 'local';
            }

            // Prepend gesture mode context as system message if from gesture
            const gestureSystemMessage = fromGesture ? {
                role: 'system' as const,
                content: modelType === 'api'
                    ? 'User is hands-free using gesture control. Build an interactive interface to guide them.\n\nAvailable gesture inputs:\n- 👍 (yes/approve/like)\n- 👎 (no/disapprove/dislike)\n- 👋 (hi/hello/greeting)\n- "ok" (okay/continue)\n- "thanks" (thank you)\n- "stop" (stop/wait)\n- Pointing finger (select UI buttons)\n\nChoose interaction style:\n- Simple binary: "Give 👍 to continue or 👎 to stop" (no JSON needed)\n- Complex choices: Use JSON UI buttons (3+ options, or multi-word responses needed)\n\nFor JSON UI (when appropriate):\n```json\n{\n  "options": [\n    {"id": "opt1", "label": "Option 1", "action": "message", "value": "option 1"},\n    {"id": "opt2", "label": "Option 2", "action": "message", "value": "option 2"}\n  ]\n}\n```\n\nGuidelines:\n- Keep response concise (2-3 sentences)\n- Use simple gestures for yes/no/continue (more efficient)\n- Use JSON UI for 3+ options or complex choices\n- Provide 2-4 options max in JSON\n- User can point at buttons with index finger'
                    : 'User is hands-free (limited input). TOTAL OUTPUT under 50 words (including any thinking). Minimize or skip thinking - just answer. End with: "Want [A] or [B]?" or "Say \'yes\' for [next step]." Use single words/emojis for options.'
            } : null;

            const baseMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content
            }));

            const apiMessages = gestureSystemMessage
                ? [gestureSystemMessage, ...baseMessages]
                : baseMessages;

            if (autoMode) {
                // Filter models based on scope
                const scopedModels = models.filter(m => {
                    if (autoModeScope === 'local') return m.type === 'local';
                    if (autoModeScope === 'api') return m.type === 'api';
                    return true;
                });

                const sortedModels = scopedModels
                    .map(m => ({
                        ...m,
                        priority: getModelPriority(m.id, m.type || 'local', m.priority)
                    }))
                    .sort((a, b) => {
                        // Sort by priority first
                        if (a.priority !== b.priority) {
                            return a.priority - b.priority;
                        }
                        // If priorities are equal, sort by type (local before api)
                        if (a.type !== b.type) {
                            return a.type === 'local' ? -1 : 1;
                        }
                        // Finally sort by id for consistency
                        return a.id.localeCompare(b.id);
                    });

                let lastError: string | null = null;

                for (const model of sortedModels) {
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
                        // Notify parent about the model used (for mode switching)
                        onModelUsed?.(model.id);
                        return;
                    }

                    lastError = result.content;
                }

                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `All ${autoModeScope} models failed to respond. Last error: ${lastError}`,
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

    const autoScopeLabels: Record<ChatAutoModeScope, string> = {
        local: 'Local',
        api: 'API'
    };

    return (
        <div ref={containerRef} className="flex flex-col h-full relative isolate z-[10]">
            {/* Blue Selection Rectangle */}
            <SelectionOverlay rect={selectionRect} />

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 scroll-smooth pb-32 chat-scroll relative z-[10] [mask-image:linear-gradient(to_bottom,transparent_0%,black_2rem,black_calc(100%-4rem),transparent_100%)]"
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
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 select-none pb-20 relative">
                            <Bot size={48} className="mb-4 opacity-50" />
                            <div className="flex items-center gap-2 mb-4">
                                <p className="text-base opacity-50">Chat with</p>
                                {autoMode ? (
                                    <div className="flex items-center gap-1.5">
                                        <div className="relative" ref={dropdownRef}>
                                            <button
                                                onClick={() => setShowAutoDropdown(!showAutoDropdown)}
                                                className="h-7 px-2.5 flex items-center gap-1.5 rounded-md border bg-slate-700/40 hover:bg-slate-700/60 border-slate-600/40 transition-all active:scale-95 text-xs font-medium"
                                            >
                                                <Zap size={12} className="text-yellow-400" />
                                                <span className="text-slate-200/60">
                                                    {autoModeScope === 'local' && 'Local Models (Auto)'}
                                                    {autoModeScope === 'api' && 'API Models (Auto)'}
                                                </span>
                                                <ChevronDown size={11} className="text-slate-200/60 transition-transform" />
                                            </button>

                                            {showAutoDropdown && (
                                                <div className="absolute top-full left-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                                                {(['local', 'api'] as ChatAutoModeScope[]).map(scope => (
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

                                        <div
                                            className="relative"
                                            onMouseEnter={() => setShowTooltip(true)}
                                            onMouseLeave={() => setShowTooltip(false)}
                                        >
                                            <Info size={13} className="text-slate-500/60 hover:text-slate-400/80 transition-colors cursor-help" />
                                            {showTooltip && (
                                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs z-50 shadow-xl w-48">
                                                    {autoModeScope === 'local' && (
                                                        <ul className="space-y-1.5">
                                                            <li className="flex items-center gap-2">
                                                                <Zap size={11} className="shrink-0 text-emerald-400" />
                                                                <span>Small language models</span>
                                                            </li>
                                                            <li className="flex items-center gap-2">
                                                                <Server size={11} className="shrink-0 text-slate-400" />
                                                                <span>Hosted on our servers</span>
                                                            </li>
                                                            <li className="flex items-center gap-2">
                                                                <Infinity size={11} className="shrink-0 text-blue-400" />
                                                                <span>No quota limits</span>
                                                            </li>
                                                        </ul>
                                                    )}
                                                    {autoModeScope === 'api' && (
                                                        <ul className="space-y-1.5">
                                                            <li className="flex items-center gap-2">
                                                                <Cloud size={11} className="shrink-0 text-blue-400" />
                                                                <span>Cloud-based models</span>
                                                            </li>
                                                            <li className="flex items-center gap-2">
                                                                <Sparkles size={11} className="shrink-0 text-yellow-400" />
                                                                <span>Free quota available</span>
                                                            </li>
                                                            <li className="flex items-center gap-2">
                                                                <Zap size={11} className="shrink-0 text-purple-400" />
                                                                <span>More capable models</span>
                                                            </li>
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5">
                                        <div className="relative" ref={modelSelectorRef}>
                                            <button
                                                onClick={() => setShowModelSelector(!showModelSelector)}
                                                className="h-7 px-2.5 flex items-center gap-1.5 rounded-md border bg-slate-700/40 hover:bg-slate-700/60 border-slate-600/40 transition-all active:scale-95 text-xs font-medium"
                                                disabled={isGenerating}
                                            >
                                                {selectedModel && (
                                                    <div className={`w-2 h-2 rounded-full ${selectedModel.type === 'local' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                                                )}
                                                <span className="text-slate-200/60">{selectedModel ? selectedModel.name : 'Select a model'}</span>
                                                {!isGenerating && <ChevronDown size={11} className="text-slate-200/60" />}
                                            </button>

                                            {showModelSelector && !isGenerating && (
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
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                                        <span>Local Models</span>
                                                                    </div>
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

                                                        {models.filter(m => m.type === 'api').length > 0 && (
                                                            <div>
                                                                <button
                                                                    onClick={() => setExpandedApiModels(!expandedApiModels)}
                                                                    className="w-full px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold hover:bg-slate-700/30 transition-colors border-t border-slate-700/50"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                                        <span>API Models</span>
                                                                    </div>
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

                                        {selectedModel && (
                                            <div
                                                className="relative"
                                                onMouseEnter={() => setShowTooltip(true)}
                                                onMouseLeave={() => setShowTooltip(false)}
                                            >
                                                <Info size={13} className="text-slate-500/60 hover:text-slate-400/80 transition-colors cursor-help" />
                                                {showTooltip && (
                                                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs z-50 shadow-xl w-48">
                                                        {selectedModel.type === 'local' && (
                                                            <ul className="space-y-1.5">
                                                                <li className="flex items-center gap-2">
                                                                    <Zap size={11} className="shrink-0 text-emerald-400" />
                                                                    <span>Small language models</span>
                                                                </li>
                                                                <li className="flex items-center gap-2">
                                                                    <Server size={11} className="shrink-0 text-slate-400" />
                                                                    <span>Hosted on our servers</span>
                                                                </li>
                                                                <li className="flex items-center gap-2">
                                                                    <Infinity size={11} className="shrink-0 text-blue-400" />
                                                                    <span>No quota limits</span>
                                                                </li>
                                                            </ul>
                                                        )}
                                                        {selectedModel.type === 'api' && (
                                                            <ul className="space-y-1.5">
                                                                <li className="flex items-center gap-2">
                                                                    <Cloud size={11} className="shrink-0 text-blue-400" />
                                                                    <span>Cloud-based models</span>
                                                                </li>
                                                                <li className="flex items-center gap-2">
                                                                    <Sparkles size={11} className="shrink-0 text-yellow-400" />
                                                                    <span>Free quota available</span>
                                                                </li>
                                                                <li className="flex items-center gap-2">
                                                                    <Zap size={11} className="shrink-0 text-purple-400" />
                                                                    <span>More capable models</span>
                                                                </li>
                                                            </ul>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!githubToken && ((!autoMode && selectedModel?.type === 'api') || (autoMode && autoModeScope === 'api')) && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-16 flex items-center gap-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs whitespace-nowrap">
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

            {/* Input Area - always positioned to account for right panel */}
            <PromptInput
                inputRef={inputRef}
                inputFocused={inputFocused}
                setInputFocused={setInputFocused}
                onSendMessage={handleSend}
                onOpenTopics={onOpenTopics}
                placeholder={autoMode ? "Message (Auto mode - will use auto-selected model)..." : (selectedModel ? `Message ${selectedModel.name}...` : "Select a model from the dock to start chatting...")}
                isGenerating={isGenerating}
                onStop={handleStop}
                className="fixed bottom-0 left-0 right-[400px] xl:right-[480px] z-[100] pb-6 px-3 sm:px-4 flex justify-center items-end pointer-events-none transition-all duration-300"
                style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            />
        </div>
    );
});

export default ChatView;
