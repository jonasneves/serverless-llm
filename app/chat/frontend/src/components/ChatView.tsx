import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User, ChevronLeft, ChevronRight, Plus, X, Check, Loader2, Copy, Search, Volume2, VolumeX } from 'lucide-react';
import { useListSelectionBox } from '../hooks/useListSelectionBox';
import { useSmartModelSelection } from '../hooks/useSmartModelSelection';
import SelectionOverlay from './SelectionOverlay';
import { extractTextWithoutJSON } from '../hooks/useGestureOptions';
import GestureOptions from './GestureOptions';
import { fetchChatStream, streamSseEvents } from '../utils/streaming';
import ModelModeSelector from './ModelModeSelector';
import { useGestureOptional } from '../context/GestureContext';


export interface ChatViewHandle {
    sendMessage: (text: string, fromGesture?: boolean) => void;
    setInput: (text: string) => void;
    stopGeneration: () => void;
    scroll: (deltaY: number) => void;
}

export type ChatAutoModeScope = 'local' | 'api' | 'external';

export interface ModelResponse {
    modelId: string;
    modelName: string;
    content: string;
    error?: boolean;
    loading?: boolean;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    modelName?: string;
    modelId?: string;
    error?: boolean;
    // Multi-model comparison support
    alternateResponses?: ModelResponse[];
    activeResponseIndex?: number; // 0 = primary, 1+ = alternates
}

interface ChatViewProps {
    models: Model[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    githubToken?: string;
    openrouterKey?: string;
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
    openrouterKey,
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
    const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
    // Compare mode state
    const [compareMenuIndex, setCompareMenuIndex] = useState<number | null>(null);
    const [compareSelectedModels, setCompareSelectedModels] = useState<Set<string>>(new Set());
    const [compareSearchQuery, setCompareSearchQuery] = useState('');
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [mutedParallelModels, setMutedParallelModels] = useState<Set<string>>(new Set());
    const compareAbortRefs = useRef<Map<string, AbortController>>(new Map());
    const streamBatchRef = useRef<Map<number, { content: string; timeout: number | null }>>(new Map());
    const abortControllerRef = useRef<AbortController | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const compareMenuRef = useRef<HTMLDivElement>(null);
    const compareSearchRef = useRef<HTMLInputElement>(null);

    // Gesture context for Easter egg
    const gestureCtx = useGestureOptional();
    const isMiddleFinger = gestureCtx?.gestureState?.gesture === 'Middle_Finger';

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
                openrouter_key: openrouterKey || null,
            }, abortControllerRef.current?.signal);

            let responseContent = '';

            await streamSseEvents(stream, (event) => {
                // Check for abort
                if (abortControllerRef.current?.signal.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }

                // IMPORTANT: Check for errors FIRST, before token content
                // Error events can have 'content' field too, so we must check 'error' first
                if (event.event === 'error' || event.error) {
                    // Backend may send error in different formats:
                    // 1. { error: true, content: 'message' } - from stream_multiple_models
                    // 2. { event: 'error', error: 'message' } - from other handlers
                    const errorMsg = typeof event.error === 'string'
                        ? event.error
                        : (event.content || 'Stream failed');
                    const isRateLimit = errorMsg.includes('429') ||
                        errorMsg.toLowerCase().includes('rate limit') ||
                        errorMsg.toLowerCase().includes('too many requests');
                    if (isRateLimit) {
                        recordRateLimit(modelId);
                        console.log(`[Auto Mode] Rate limit detected for ${modelId}, trying next model...`);
                    }
                    throw new Error(errorMsg);
                } else if ((event.event === 'token' || event.content) && event.content) {
                    responseContent += event.content;
                    setCurrentResponse(prev => prev + event.content);
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

        console.log(`[Chat] Sending message. autoMode=${autoMode}, autoModeScope=${autoModeScope}, selectedModelId=${selectedModelId}`);

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

            // Easter egg: Angry robot context
            const angrySystemMessage = (text === "🖕" || text.includes("middle finger")) ? {
                role: 'system' as const,
                content: "The user is showing you their middle finger (gesture). This is a playful interaction. Respond with humorous, over-the-top anger, indignation, or witty comeback. Don't be actually offended, but play along with the 'angry robot' persona."
            } : null;

            const baseMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content
            }));

            const apiMessages = [
                ...(gestureSystemMessage ? [gestureSystemMessage] : []),
                ...(angrySystemMessage ? [angrySystemMessage] : []),
                ...baseMessages
            ];

            if (autoMode) {
                // Filter models based on scope, with fallback to other type
                const primaryModels = models.filter(m => {
                    if (autoModeScope === 'local') return m.type === 'self-hosted';
                    if (autoModeScope === 'api') return m.type === 'github' || m.type === 'external';
                    return true;
                });

                const fallbackModels = models.filter(m => {
                    if (autoModeScope === 'local') return m.type === 'github' || m.type === 'external';
                    if (autoModeScope === 'api') return m.type === 'self-hosted';
                    return false;
                });

                const sortedPrimary = sortModels(primaryModels);
                const sortedFallback = sortModels(fallbackModels);

                let lastError: string | null = null;
                let triedFallback = false;
                let rateLimitCount = 0;

                console.log(`[Auto Mode] Starting with ${sortedPrimary.length} primary (${autoModeScope}) models, ${sortedFallback.length} fallback models`);

                // Try primary models first
                for (const model of sortedPrimary) {
                    console.log(`[Auto Mode] Trying primary model: ${model.id}`);
                    setCurrentAutoModel(model.id);
                    setCurrentResponse('');

                    const result = await tryModelStream(model.id, apiMessages);

                    if (result.success) {
                        console.log(`[Auto Mode] Success with ${model.id}`);
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

                    console.log(`[Auto Mode] Failed with ${model.id}: ${result.content?.substring(0, 100)}`);
                    if (result.isRateLimit) {
                        rateLimitCount++;
                    }
                    lastError = result.content;
                }

                // If all primary models failed, try fallback models
                if (sortedFallback.length > 0) {
                    console.log(`[Auto Mode] All primary models failed, trying ${sortedFallback.length} fallback models`);
                    triedFallback = true;
                    for (const model of sortedFallback) {
                        console.log(`[Auto Mode] Trying fallback model: ${model.id}`);
                        setCurrentAutoModel(model.id);
                        setCurrentResponse('');

                        const result = await tryModelStream(model.id, apiMessages);

                        if (result.success) {
                            console.log(`[Auto Mode] Success with fallback ${model.id}`);
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

                        console.log(`[Auto Mode] Fallback failed with ${model.id}: ${result.content?.substring(0, 100)}`);
                        if (result.isRateLimit) {
                            rateLimitCount++;
                        }
                        lastError = result.content;
                    }
                } else {
                    console.log(`[Auto Mode] No fallback models available`);
                }

                console.log(`[Auto Mode] All ${sortedPrimary.length + sortedFallback.length} models failed (${rateLimitCount} rate limited)`);

                // Build a user-friendly error message
                let errorMsg: string;
                const totalModels = sortedPrimary.length + sortedFallback.length;
                if (rateLimitCount > 0 && rateLimitCount >= totalModels) {
                    errorMsg = `⏱️ All ${totalModels} models are currently rate limited. GitHub Models has strict free tier limits. Try again in a minute, or add your own GitHub token in Settings for higher quota.`;
                } else if (rateLimitCount > 0) {
                    errorMsg = `All models failed (${rateLimitCount} rate limited). Last error: ${lastError}`;
                } else if (triedFallback) {
                    errorMsg = `All models failed to respond. Last error: ${lastError}`;
                } else {
                    errorMsg = `All ${autoModeScope} models failed to respond. Last error: ${lastError}`;
                }

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

    // Regenerate a specific message with a different model
    const regenerateWithModel = async (messageIndex: number, newModelId: string) => {
        if (isGenerating) return;

        const targetMessage = messages[messageIndex];
        if (targetMessage.role !== 'assistant') return;

        // Find the user message that triggered this response
        let userMessageIndex = messageIndex - 1;
        while (userMessageIndex >= 0 && messages[userMessageIndex].role !== 'user') {
            userMessageIndex--;
        }
        if (userMessageIndex < 0) return;

        const newModel = models.find(m => m.id === newModelId);
        if (!newModel) return;

        // Build conversation history up to (but not including) the target assistant message
        const historyMessages = messages.slice(0, messageIndex).map(m => ({
            role: m.role,
            content: m.content
        }));

        setIsGenerating(true);
        setRegeneratingIndex(messageIndex);
        setCurrentAutoModel(newModelId);

        // Immediately update the message to show it's regenerating with new model name
        setMessages(prev => prev.map((msg, idx) => {
            if (idx === messageIndex) {
                return {
                    ...msg,
                    content: '',
                    modelName: newModel.name,
                    modelId: newModelId,
                    error: undefined
                };
            }
            return msg;
        }));

        abortControllerRef.current = new AbortController();

        try {
            const stream = await fetchChatStream({
                models: [newModelId],
                messages: historyMessages,
                max_tokens: 4096,
                temperature: 0.7,
                github_token: githubToken,
                openrouter_key: openrouterKey
            }, abortControllerRef.current.signal);

            let responseContent = '';

            await streamSseEvents(stream, (event) => {
                if (abortControllerRef.current?.signal.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }

                if (event.event === 'error' || event.error) {
                    const errorMsg = typeof event.error === 'string'
                        ? event.error
                        : (event.content || 'Stream failed');
                    throw new Error(errorMsg);
                } else if ((event.event === 'token' || event.content) && event.content) {
                    responseContent += event.content;
                    // Update the message content in-place as we stream
                    setMessages(prev => prev.map((msg, idx) => {
                        if (idx === messageIndex) {
                            return {
                                ...msg,
                                content: responseContent
                            };
                        }
                        return msg;
                    }));
                }
            });

            recordSuccess(newModelId);
            onModelUsed?.(newModelId);

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                setMessages(prev => prev.map((msg, idx) => {
                    if (idx === messageIndex) {
                        return {
                            ...msg,
                            content: error.message,
                            error: true
                        };
                    }
                    return msg;
                }));
            }
        } finally {
            setIsGenerating(false);
            setRegeneratingIndex(null);
            setCurrentAutoModel(null);
            abortControllerRef.current = null;
        }
    };

    // Get next/prev model for navigation
    const getAdjacentModel = (currentModelId: string | undefined, direction: 'prev' | 'next'): Model | null => {
        if (!currentModelId) return models[0] || null;

        const currentModel = models.find(m => m.id === currentModelId);
        const modelType = currentModel?.type || 'api';

        // Get models of the same type for navigation
        const sameTypeModels = models.filter(m => m.type === modelType);
        const currentIndex = sameTypeModels.findIndex(m => m.id === currentModelId);

        if (currentIndex === -1) return sameTypeModels[0] || null;

        if (direction === 'prev') {
            return currentIndex > 0 ? sameTypeModels[currentIndex - 1] : sameTypeModels[sameTypeModels.length - 1];
        } else {
            return currentIndex < sameTypeModels.length - 1 ? sameTypeModels[currentIndex + 1] : sameTypeModels[0];
        }
    };

    // Compare mode functions
    const openCompareMenu = (messageIndex: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (compareMenuIndex === messageIndex) {
            setCompareMenuIndex(null);
            setCompareSelectedModels(new Set());
            setCompareSearchQuery('');
        } else {
            setCompareMenuIndex(messageIndex);
            setCompareSelectedModels(new Set());
            setCompareSearchQuery('');
            // Focus search input after menu opens
            setTimeout(() => compareSearchRef.current?.focus(), 50);
        }
    };

    const closeCompareMenu = useCallback(() => {
        setCompareMenuIndex(null);
        setCompareSelectedModels(new Set());
        setCompareSearchQuery('');
    }, []);

    const toggleCompareModel = (modelId: string) => {
        setCompareSelectedModels(prev => {
            const newSet = new Set(prev);
            if (newSet.has(modelId)) {
                newSet.delete(modelId);
            } else {
                newSet.add(modelId);
            }
            return newSet;
        });
    };

    // Cancel a specific model's comparison generation
    const cancelComparison = useCallback((messageIndex: number, modelId: string) => {
        const controller = compareAbortRefs.current.get(modelId);
        if (controller) {
            controller.abort();
            compareAbortRefs.current.delete(modelId);
        }
        // Remove from alternateResponses
        setMessages(prev => prev.map((msg, idx) => {
            if (idx === messageIndex && msg.alternateResponses) {
                return {
                    ...msg,
                    alternateResponses: msg.alternateResponses.filter(alt => alt.modelId !== modelId)
                };
            }
            return msg;
        }));
    }, [setMessages]);

    // Copy response to clipboard
    const copyResponse = useCallback(async (messageIndex: number, responseIndex: number = 0) => {
        const msg = messages[messageIndex];
        if (!msg) return;

        let content: string;
        if (responseIndex === 0 || !msg.alternateResponses) {
            content = msg.content;
        } else {
            content = msg.alternateResponses[responseIndex - 1]?.content || msg.content;
        }

        try {
            await navigator.clipboard.writeText(content);
            const id = `${messageIndex}-${responseIndex}`;
            setCopiedMessageId(id);
            setTimeout(() => setCopiedMessageId(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [messages]);

    const startComparison = async (messageIndex: number) => {
        if (compareSelectedModels.size === 0) return;

        const targetMessage = messages[messageIndex];
        if (targetMessage.role !== 'assistant') return;

        // Find the user message that triggered this response
        let userMessageIndex = messageIndex - 1;
        while (userMessageIndex >= 0 && messages[userMessageIndex].role !== 'user') {
            userMessageIndex--;
        }
        if (userMessageIndex < 0) return;

        // Build conversation history up to (but not including) the target assistant message
        const historyMessages = messages.slice(0, messageIndex).map(m => ({
            role: m.role,
            content: m.content
        }));

        // Initialize alternateResponses for selected models
        const modelsToCompare = Array.from(compareSelectedModels);
        const initialResponses: ModelResponse[] = modelsToCompare.map(modelId => {
            const model = models.find(m => m.id === modelId);
            return {
                modelId,
                modelName: model?.name || modelId,
                content: '',
                loading: true
            };
        });

        // Update message with loading alternates
        setMessages(prev => prev.map((msg, idx) => {
            if (idx === messageIndex) {
                return {
                    ...msg,
                    alternateResponses: [...(msg.alternateResponses || []), ...initialResponses]
                };
            }
            return msg;
        }));

        setCompareMenuIndex(null);
        setCompareSelectedModels(new Set());

        // Generate responses in parallel
        const generateForModel = async (modelId: string) => {
            const model = models.find(m => m.id === modelId);
            if (!model) return;

            const abortController = new AbortController();
            compareAbortRefs.current.set(modelId, abortController);

            try {
                const stream = await fetchChatStream({
                    models: [modelId],
                    messages: historyMessages,
                    max_tokens: 4096,
                    temperature: 0.7,
                    github_token: githubToken,
                    openrouter_key: openrouterKey
                }, abortController.signal);

                let responseContent = '';

                await streamSseEvents(stream, (event) => {
                    if (abortController.signal.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }

                    if (event.event === 'error' || event.error) {
                        const errorMsg = typeof event.error === 'string'
                            ? event.error
                            : (event.content || 'Stream failed');
                        throw new Error(errorMsg);
                    } else if ((event.event === 'token' || event.content) && event.content) {
                        responseContent += event.content;
                        // Update this specific alternate response
                        setMessages(prev => prev.map((msg, idx) => {
                            if (idx === messageIndex && msg.alternateResponses) {
                                return {
                                    ...msg,
                                    alternateResponses: msg.alternateResponses.map(alt =>
                                        alt.modelId === modelId
                                            ? { ...alt, content: responseContent }
                                            : alt
                                    )
                                };
                            }
                            return msg;
                        }));
                    }
                });

                // Mark as complete
                setMessages(prev => prev.map((msg, idx) => {
                    if (idx === messageIndex && msg.alternateResponses) {
                        return {
                            ...msg,
                            alternateResponses: msg.alternateResponses.map(alt =>
                                alt.modelId === modelId
                                    ? { ...alt, loading: false }
                                    : alt
                            )
                        };
                    }
                    return msg;
                }));

                recordSuccess(modelId);

            } catch (error: any) {
                if (error.name !== 'AbortError') {
                    setMessages(prev => prev.map((msg, idx) => {
                        if (idx === messageIndex && msg.alternateResponses) {
                            return {
                                ...msg,
                                alternateResponses: msg.alternateResponses.map(alt =>
                                    alt.modelId === modelId
                                        ? { ...alt, content: error.message, error: true, loading: false }
                                        : alt
                                )
                            };
                        }
                        return msg;
                    }));
                }
            } finally {
                compareAbortRefs.current.delete(modelId);
            }
        };

        // Start all in parallel
        modelsToCompare.forEach(modelId => generateForModel(modelId));
    };

    const setActiveResponse = (messageIndex: number, responseIndex: number) => {
        setMessages(prev => prev.map((msg, idx) => {
            if (idx === messageIndex) {
                return { ...msg, activeResponseIndex: responseIndex };
            }
            return msg;
        }));
    };

    const removeParallelResponse = (messageIndex: number, modelId: string) => {
        if (compareAbortRefs.current.has(modelId)) {
            cancelComparison(messageIndex, modelId);
            return;
        }
        setMessages(prev => prev.map((msg, idx) => {
            if (idx !== messageIndex || !msg.alternateResponses) return msg;
            const nextAlternates = msg.alternateResponses.filter(alt => alt.modelId !== modelId);
            if (nextAlternates.length === msg.alternateResponses.length) return msg;

            const activeIndex = msg.activeResponseIndex ?? 0;
            const activeModelId = activeIndex === 0 ? msg.modelId : msg.alternateResponses[activeIndex - 1]?.modelId;
            const nextActiveIndex = activeModelId === modelId ? 0 : activeIndex;

            return {
                ...msg,
                alternateResponses: nextAlternates,
                activeResponseIndex: nextActiveIndex,
            };
        }));
    };

    const toggleMuteModel = (modelId: string) => {
        setMutedParallelModels(prev => {
            const next = new Set(prev);
            if (next.has(modelId)) {
                next.delete(modelId);
            } else {
                next.add(modelId);
            }
            return next;
        });
    };

    useEffect(() => {
        if (mutedParallelModels.size === 0) return;
        setMessages(prev => prev.map((msg) => {
            if (!msg.alternateResponses || msg.alternateResponses.length === 0) return msg;
            const activeIndex = msg.activeResponseIndex ?? 0;
            const activeModelId = activeIndex === 0 ? msg.modelId : msg.alternateResponses[activeIndex - 1]?.modelId;
            if (!activeModelId || !mutedParallelModels.has(activeModelId)) return msg;

            if (msg.modelId && !mutedParallelModels.has(msg.modelId)) {
                return { ...msg, activeResponseIndex: 0 };
            }

            const nextAltIndex = msg.alternateResponses.findIndex(alt => !mutedParallelModels.has(alt.modelId));
            if (nextAltIndex === -1) return msg;
            return { ...msg, activeResponseIndex: nextAltIndex + 1 };
        }));
    }, [mutedParallelModels, setMessages]);

    // Close compare menu on click outside or Escape key
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (compareMenuRef.current && !compareMenuRef.current.contains(e.target as Node)) {
                closeCompareMenu();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeCompareMenu();
            }
        };
        if (compareMenuIndex !== null) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [compareMenuIndex, closeCompareMenu]);

    const handleDeleteSelected = () => {
        if (selectedMessages.size === 0) return;
        setMessages(prev => prev.filter((_, index) => !selectedMessages.has(index)));
        setSelectedMessages(new Set());
    };

    const selectedModel = models.find(m => m.id === selectedModelId);
    const displayModel = autoMode && currentAutoModel
        ? models.find(m => m.id === currentAutoModel)
        : selectedModel;
    const latestParallelMessage = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const msg = messages[i];
            if (msg.role === 'assistant' && msg.alternateResponses && msg.alternateResponses.length > 0) {
                return { msg, index: i };
            }
        }
        return null;
    }, [messages]);

    const parallelRoster = useMemo(() => {
        if (!latestParallelMessage) return [];
        const { msg } = latestParallelMessage;
        const entries: Array<{ modelId: string; modelName: string; isPrimary: boolean }> = [];
        if (msg.modelId) {
            entries.push({
                modelId: msg.modelId,
                modelName: msg.modelName || msg.modelId,
                isPrimary: true,
            });
        }
        msg.alternateResponses?.forEach(alt => {
            if (alt.modelId && !entries.find(entry => entry.modelId === alt.modelId)) {
                entries.push({
                    modelId: alt.modelId,
                    modelName: alt.modelName || alt.modelId,
                    isPrimary: false,
                });
            }
        });
        return entries;
    }, [latestParallelMessage]);

    return (
        <div ref={containerRef} className="flex flex-col h-full relative isolate z-[10]">
            {/* Blue Selection Rectangle */}
            <SelectionOverlay rect={selectionRect} />

            {/* Parallel Mode Bar */}
            {latestParallelMessage && parallelRoster.length > 1 && (
                <div className="mx-auto w-full px-4 pt-2 pb-1" style={{ maxWidth: '680px' }}>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 uppercase tracking-wider text-[9px]">
                            Parallel Mode
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {parallelRoster.map(entry => {
                                const isMuted = mutedParallelModels.has(entry.modelId);
                                return (
                                    <div
                                        key={entry.modelId}
                                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${isMuted
                                            ? 'border-slate-700/60 bg-slate-800/40 text-slate-500'
                                            : entry.isPrimary
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                                : 'border-slate-700/60 bg-slate-800/60 text-slate-300'
                                            }`}
                                    >
                                        <span className="text-[10px] font-medium">{entry.modelName}</span>
                                        <button
                                            onClick={() => toggleMuteModel(entry.modelId)}
                                            className="p-0.5 rounded-full hover:bg-slate-700/60 transition-colors"
                                            title={isMuted ? 'Unmute' : 'Mute'}
                                        >
                                            {isMuted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                                        </button>
                                        {!entry.isPrimary && (
                                            <button
                                                onClick={() => removeParallelResponse(latestParallelMessage.index, entry.modelId)}
                                                className="p-0.5 rounded-full hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-colors"
                                                title="Remove"
                                            >
                                                <X size={10} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

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
                            {isMiddleFinger ? (
                                <div className="mb-4 relative">
                                    <div className="absolute inset-0 bg-red-500 blur-xl opacity-50 rounded-full"></div>
                                    <Bot size={72} className="relative text-red-500" />
                                    <div className="absolute -top-2 -right-2 text-3xl">💢</div>
                                </div>
                            ) : (
                                <Bot size={72} className="mb-4 opacity-50 transition-all duration-300" />
                            )}

                            {/* Model Selection Controls */}
                            <div className="flex flex-col items-center gap-2 mb-4 sticky top-4 z-30">
                                <ModelModeSelector
                                    models={models}
                                    selectedModelId={selectedModelId}
                                    onSelectModel={onSelectModel}
                                    autoMode={autoMode}
                                    setAutoMode={setAutoMode}
                                    autoModeScope={autoModeScope}
                                    setAutoModeScope={setAutoModeScope}
                                    isGenerating={isGenerating}
                                />
                            </div>

                            {!githubToken && ((!autoMode && selectedModel?.type === 'github' || selectedModel?.type === 'external') || (autoMode && autoModeScope === 'api')) && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
                                    <AlertTriangle size={11} className="shrink-0 text-yellow-500" />
                                    <span>Add GitHub token in Settings for dedicated quota</span>
                                </div>
                            )}
                        </div>
                    )}

                    {messages.map((msg, idx) => {
                        const hasGestureOptions = msg.role === 'assistant' && gesturesActive && msg.content.includes('```json');

                        return (
                            <div
                                key={idx}
                                ref={(el) => {
                                    if (el) messageRefs.current.set(idx, el);
                                    else messageRefs.current.delete(idx);
                                }}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : hasGestureOptions ? 'flex-col sm:flex-row justify-start items-start gap-4' : 'justify-start'}`}
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
                                <div
                                    className={`group relative ${hasGestureOptions ? 'w-full sm:flex-1 sm:max-w-[45%]' : 'max-w-[85%]'} rounded-2xl px-4 pt-3 pb-2 select-none transition-all cursor-pointer ${selectedMessages.has(idx)
                                        ? 'ring-2 ring-blue-500 bg-blue-500/10'
                                        : ''
                                        } ${msg.role === 'user'
                                            ? 'bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-sm'
                                            : regeneratingIndex === idx
                                                ? 'rounded-tl-sm'
                                                : msg.error
                                                    ? 'bg-red-500/10 border border-red-500/30 text-red-200 rounded-tl-sm'
                                                    : 'bg-slate-800/60 border border-slate-700/60 text-slate-200 rounded-tl-sm'
                                        }`}
                                    style={regeneratingIndex === idx ? {
                                        background: 'rgba(30, 41, 59, 0.8)',
                                        border: '1px solid rgba(251, 191, 36, 0.4)',
                                        boxShadow: '0 0 20px rgba(251, 191, 36, 0.15), inset 0 0 30px rgba(251, 191, 36, 0.03)'
                                    } : undefined}
                                >
                                    <div className={`flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider ${msg.role === 'user' ? 'text-blue-300 flex-row-reverse' : regeneratingIndex === idx ? 'text-amber-400/80' : 'text-slate-400'}`}>
                                        {msg.role === 'user' ? (
                                            <User size={12} />
                                        ) : regeneratingIndex === idx ? (
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
                                                        <linearGradient id="regenSpinnerGradient" gradientUnits="userSpaceOnUse" x1="3" y1="12" x2="12" y2="3">
                                                            <stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
                                                            <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.5" />
                                                            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                                                        </linearGradient>
                                                    </defs>
                                                    <circle
                                                        cx="12"
                                                        cy="12"
                                                        r="9"
                                                        stroke="url(#regenSpinnerGradient)"
                                                        strokeWidth="2.5"
                                                        fill="none"
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                            </div>
                                        ) : (
                                            <Bot size={12} />
                                        )}
                                        {msg.role === 'user' ? (
                                            'You'
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const prevModel = getAdjacentModel(msg.modelId, 'prev');
                                                        if (prevModel && !isGenerating) {
                                                            regenerateWithModel(idx, prevModel.id);
                                                        }
                                                    }}
                                                    disabled={isGenerating}
                                                    className="p-0.5 rounded hover:bg-slate-700/50 transition-colors disabled:opacity-30"
                                                    title="Try previous model"
                                                >
                                                    <ChevronLeft size={10} />
                                                </button>
                                                <span className="px-1">{msg.modelName || 'Assistant'}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const nextModel = getAdjacentModel(msg.modelId, 'next');
                                                        if (nextModel && !isGenerating) {
                                                            regenerateWithModel(idx, nextModel.id);
                                                        }
                                                    }}
                                                    disabled={isGenerating}
                                                    className="p-0.5 rounded hover:bg-slate-700/50 transition-colors disabled:opacity-30"
                                                    title="Try next model"
                                                >
                                                    <ChevronRight size={10} />
                                                </button>
                                                {/* Parallel button */}
                                                <div className="relative ml-1">
                                                    <button
                                                        onClick={(e) => openCompareMenu(idx, e)}
                                                        disabled={isGenerating}
                                                        className="p-0.5 rounded hover:bg-slate-700/50 transition-colors disabled:opacity-30"
                                                        title="Add parallel replies"
                                                    >
                                                        <Plus size={10} />
                                                    </button>
                                                    {/* Compare menu dropdown */}
                                                    {compareMenuIndex === idx && (
                                                        <div
                                                            ref={compareMenuRef}
                                                            className="absolute top-full left-0 mt-1 w-64 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div className="px-3 py-2 border-b border-slate-700/50">
                                                                <div className="relative">
                                                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                                                                    <input
                                                                        ref={compareSearchRef}
                                                                        type="text"
                                                                        placeholder="Search models..."
                                                                        value={compareSearchQuery}
                                                                        onChange={(e) => setCompareSearchQuery(e.target.value)}
                                                                        className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-700/50 border border-slate-600/50 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                                                                    />
                                                                </div>
                                                            </div>
                                                            {/* Quick select buttons */}
                                                            <div className="flex gap-1 p-2 border-b border-slate-700/50">
                                                                <button
                                                                    onClick={() => {
                                                                        const localIds = models.filter(m => m.type === 'self-hosted' && m.id !== msg.modelId).map(m => m.id);
                                                                        setCompareSelectedModels(new Set(localIds));
                                                                    }}
                                                                    className="flex-1 px-2 py-1 text-[10px] rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                                                                >
                                                                    All Self-Hosted
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        const apiIds = models.filter(m => m.type === 'github' || m.type === 'external' && m.id !== msg.modelId).map(m => m.id);
                                                                        setCompareSelectedModels(new Set(apiIds));
                                                                    }}
                                                                    className="flex-1 px-2 py-1 text-[10px] rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
                                                                >
                                                                    All GitHub
                                                                </button>
                                                            </div>
                                                            {/* Model list - filtered by search */}
                                                            <div className="max-h-48 overflow-y-auto">
                                                                {models
                                                                    .filter(m => m.id !== msg.modelId)
                                                                    .filter(m => !compareSearchQuery || m.name.toLowerCase().includes(compareSearchQuery.toLowerCase()) || m.id.toLowerCase().includes(compareSearchQuery.toLowerCase()))
                                                                    .map(model => (
                                                                        <button
                                                                            key={model.id}
                                                                            onClick={() => toggleCompareModel(model.id)}
                                                                            className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${compareSelectedModels.has(model.id)
                                                                                ? 'bg-slate-700/50 text-white'
                                                                                : 'text-slate-300 hover:bg-slate-700/30'
                                                                                }`}
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <div className={`w-2 h-2 rounded-full ${model.type === 'self-hosted' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                                                                                <span>{model.name}</span>
                                                                            </div>
                                                                            {compareSelectedModels.has(model.id) && (
                                                                                <Check size={12} className="text-emerald-400" />
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                            </div>
                                                            {/* Start comparison button */}
                                                            {compareSelectedModels.size > 0 && (
                                                                <div className="p-2 border-t border-slate-700/50">
                                                                    <button
                                                                        onClick={() => startComparison(idx)}
                                                                        className="w-full px-3 py-1.5 text-xs font-medium rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
                                                                    >
                                                                        Run parallel with {compareSelectedModels.size} model{compareSelectedModels.size > 1 ? 's' : ''}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {msg.error && <AlertTriangle size={12} className="text-red-400" />}
                                    </div>

                                    {/* Model comparison tabs - only show if there are alternates */}
                                    {msg.alternateResponses && msg.alternateResponses.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 pb-2 mb-1 border-t border-slate-700/30">
                                            <span className="text-[9px] text-slate-500 uppercase tracking-wider mr-1">Parallel:</span>
                                            <div className="flex items-center">
                                                {msg.modelId && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setActiveResponse(idx, 0); }}
                                                        className={`px-2 py-0.5 text-[9px] rounded-full transition-colors flex items-center gap-1 ${mutedParallelModels.has(msg.modelId)
                                                            ? 'bg-slate-800/60 text-slate-500 ring-1 ring-slate-700/50'
                                                            : (msg.activeResponseIndex ?? 0) === 0
                                                                ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/50'
                                                                : 'bg-slate-700/40 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                                                            }`}
                                                        title={mutedParallelModels.has(msg.modelId) ? 'Muted' : 'Primary response'}
                                                    >
                                                        {msg.modelName || 'Assistant'}
                                                    </button>
                                                )}
                                            </div>
                                            {msg.alternateResponses.map((alt, altIdx) => (
                                                <div key={alt.modelId} className="flex items-center">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!mutedParallelModels.has(alt.modelId)) {
                                                                setActiveResponse(idx, altIdx + 1);
                                                            }
                                                        }}
                                                        className={`px-2 py-0.5 text-[9px] rounded-full transition-colors flex items-center gap-1 ${alt.loading
                                                            ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                                                            : alt.error
                                                                ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40'
                                                                : mutedParallelModels.has(alt.modelId)
                                                                    ? 'bg-slate-800/60 text-slate-500 ring-1 ring-slate-700/50'
                                                                    : (msg.activeResponseIndex ?? 0) === altIdx + 1
                                                                        ? 'bg-blue-500/30 text-blue-200 ring-1 ring-blue-500/50'
                                                                        : 'bg-slate-700/40 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                                                            }`}
                                                        title={mutedParallelModels.has(alt.modelId) ? 'Muted' : 'Parallel response'}
                                                    >
                                                        {alt.loading && <Loader2 size={8} className="animate-spin text-amber-400" />}
                                                        {alt.error && <AlertTriangle size={8} className="text-red-400" />}
                                                        {alt.modelName}
                                                    </button>
                                                    {alt.loading && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); cancelComparison(idx, alt.modelId); }}
                                                            className="ml-0.5 p-0.5 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                                                            title="Cancel"
                                                        >
                                                            <X size={8} />
                                                        </button>
                                                    )}
                                                    {!alt.loading && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeParallelResponse(idx, alt.modelId);
                                                            }}
                                                            className="ml-0.5 p-0.5 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                                                            title="Remove"
                                                        >
                                                            <X size={8} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Content area */}
                                    <div className="prose prose-invert prose-sm max-w-none mt-2">
                                        {(() => {
                                            const activeIdx = msg.activeResponseIndex ?? 0;
                                            if (activeIdx === 0 || !msg.alternateResponses) {
                                                return <FormattedContent text={msg.role === 'user' ? msg.content : extractTextWithoutJSON(msg.content)} />;
                                            }
                                            const alt = msg.alternateResponses[activeIdx - 1];
                                            if (!alt) return <FormattedContent text={extractTextWithoutJSON(msg.content)} />;
                                            return <FormattedContent text={extractTextWithoutJSON(alt.content)} />;
                                        })()}
                                    </div>

                                    {/* Copy button - at message wrapper level, top right corner */}
                                    {msg.role === 'assistant' && msg.content && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                copyResponse(idx, msg.activeResponseIndex ?? 0);
                                            }}
                                            className={`absolute bottom-2 right-2 p-1.5 rounded-md transition-all z-10 ${copiedMessageId === `${idx}-${msg.activeResponseIndex ?? 0}`
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'opacity-0 group-hover:opacity-100 bg-slate-700/70 hover:bg-slate-600/70 text-slate-400'
                                                }`}
                                            title={copiedMessageId === `${idx}-${msg.activeResponseIndex ?? 0}` ? 'Copied!' : 'Copy response'}
                                        >
                                            {copiedMessageId === `${idx}-${msg.activeResponseIndex ?? 0}` ? (
                                                <Check size={12} />
                                            ) : (
                                                <Copy size={12} />
                                            )}
                                        </button>
                                    )}
                                </div>

                                {hasGestureOptions && (
                                    <>
                                        {/* Mobile: horizontal separator, Desktop: vertical connecting line */}
                                        <div className="w-full sm:hidden h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent my-3"></div>
                                        <div className="hidden sm:flex items-center self-stretch py-6">
                                            <div className="h-full w-px bg-gradient-to-b from-transparent via-blue-500/30 to-transparent"></div>
                                            <div className="w-3 h-px bg-blue-500/30"></div>
                                        </div>

                                        {/* UI Build Options */}
                                        <div className="w-full sm:flex-1 sm:max-w-[40%]">
                                            <GestureOptions
                                                content={msg.content}
                                                onSelect={(value) => handleSend(value, true)}
                                                isInline={false}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {isGenerating && regeneratingIndex === null && (
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
