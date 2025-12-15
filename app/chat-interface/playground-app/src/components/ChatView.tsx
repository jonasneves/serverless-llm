import { useState, useRef, useEffect } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User, Eraser, Zap, ChevronDown } from 'lucide-react';
import { getModelPriority } from '../constants';
import { useListSelectionBox } from '../hooks/useListSelectionBox';

type AutoModeScope = 'all' | 'local' | 'api';

interface ChatViewProps {
    models: Model[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    githubToken?: string;
    onOpenTopics: () => void;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    modelName?: string;
    error?: boolean;
}

export default function ChatView({
    models,
    selectedModelId,
    onSelectModel,
    githubToken,
    onOpenTopics
}: ChatViewProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentResponse, setCurrentResponse] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const [autoMode, setAutoMode] = useState(true);
    const [autoModeScope, setAutoModeScope] = useState<AutoModeScope>('local');
    const [showAutoDropdown, setShowAutoDropdown] = useState(false);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [expandedLocalModels, setExpandedLocalModels] = useState(true);
    const [expandedApiModels, setExpandedApiModels] = useState(false);
    const [currentAutoModel, setCurrentAutoModel] = useState<string | null>(null);
    const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // Use list selection box hook for drag selection
    const { selectionRect } = useListSelectionBox({
        containerRef: scrollRef,
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

    // Handle delete key for selected messages
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
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

    const handleSend = async (text: string) => {
        if (!text.trim() || isGenerating) return;
        if (!autoMode && !selectedModelId) return;

        const userMessage: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setIsGenerating(true);
        setCurrentResponse('');

        abortControllerRef.current = new AbortController();

        try {
            const apiMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content
            }));

            if (autoMode) {
                // Filter models based on scope
                const scopedModels = models.filter(m => {
                    if (autoModeScope === 'all') return true;
                    if (autoModeScope === 'local') return m.type === 'local';
                    if (autoModeScope === 'api') return m.type === 'api';
                    return true;
                });

                const sortedModels = scopedModels
                    .map(m => {
                        const basePriority = getModelPriority(m.id, m.type || 'local');
                        // When scope is 'all', ensure local models always come before API models
                        // by adding 1000 to API model priorities
                        const adjustedPriority = autoModeScope === 'all' && m.type === 'api'
                            ? basePriority + 1000
                            : basePriority;
                        return { ...m, priority: adjustedPriority };
                    })
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
                            modelName: model.name
                        }]);
                        setCurrentResponse('');
                        setCurrentAutoModel(null);
                        return;
                    }

                    lastError = result.content;
                }

                const scopeLabel = autoModeScope === 'all' ? 'all' : autoModeScope;
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `All ${scopeLabel} models failed to respond. Last error: ${lastError}`,
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
                        modelName: model?.name
                    }]);
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

    const handleClear = () => {
        setMessages([]);
        setCurrentResponse('');
        setSelectedMessages(new Set());
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
                                    disabled={isGenerating}
                                >
                                    <span>{selectedModel ? selectedModel.name : 'Select model'}</span>
                                    {!isGenerating && <ChevronDown size={12} />}
                                </button>

                                {showModelSelector && !isGenerating && (
                                    <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                                        {models.length === 0 ? (
                                            <div className="px-3 py-4 text-xs text-slate-500 text-center">
                                                No models available
                                            </div>
                                        ) : (
                                            <>
                                                {/* Local Models Section */}
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

                                                {/* API Models Section */}
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

                                                {/* Enable Auto Mode */}
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

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 scroll-smooth pb-32 chat-scroll relative"
            >
                {/* Blue Selection Rectangle */}
                {selectionRect && (
                    <div
                        style={{
                            position: 'absolute',
                            left: selectionRect.left,
                            top: selectionRect.top,
                            width: selectionRect.width,
                            height: selectionRect.height,
                            border: '2px solid rgb(59, 130, 246)',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            pointerEvents: 'none',
                            zIndex: 40,
                        }}
                    />
                )}
                <div className="mx-auto w-full min-h-full flex flex-col space-y-6" style={{ maxWidth: '600px' }}>
                    {messages.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50 select-none pb-20">
                            <Bot size={48} className="mb-4" />
                            <p className="text-lg">Chat with {selectedModel?.name || 'AI'}</p>
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
                        >
                            <div className={`max-w-[85%] rounded-2xl px-4 pt-3 pb-0 select-none transition-all ${selectedMessages.has(idx)
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
                                    <FormattedContent text={msg.content} />
                                </div>
                            </div>
                        </div>
                    ))}

                    {isGenerating && (
                        <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 pt-3 pb-0 bg-slate-800/60 border border-slate-700/60 text-slate-200">
                                <div className="flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    <Bot size={12} />
                                    {displayModel?.name || 'Assistant'}
                                </div>
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <FormattedContent text={currentResponse} />
                                    <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse align-middle"></span>
                                </div>
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
                onSendMessage={handleSend}
                onOpenTopics={onOpenTopics}
                placeholder={autoMode ? "Message (Auto mode - will use best available model)..." : (selectedModel ? `Message ${selectedModel.name}...` : "Select a model from the dock to start chatting...")}
                isGenerating={isGenerating}
                onStop={handleStop}
            />
        </div>
    );
}
