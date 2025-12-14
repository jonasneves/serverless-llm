import { useState, useRef, useEffect } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import PromptInput from './PromptInput';
import { Bot, AlertTriangle, User, Eraser } from 'lucide-react';

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
    error?: boolean;
}

export default function ChatView({
    models,
    selectedModelId,
    // onSelectModel,
    githubToken,
    onOpenTopics
}: ChatViewProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentResponse, setCurrentResponse] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, currentResponse, isGenerating]);

    const handleSend = async (text: string) => {
        if (!text.trim() || !selectedModelId || isGenerating) return;

        const userMessage: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setIsGenerating(true);
        setCurrentResponse('');

        abortControllerRef.current = new AbortController();

        try {
            // Prepare history for API
            const apiMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content
            }));

            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    models: [selectedModelId],
                    messages: apiMessages,
                    max_tokens: 2048,
                    temperature: 0.7,
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
                                setMessages(prev => [...prev, { role: 'assistant', content: data.content, error: true }]);
                                setIsGenerating(false);
                                return;
                            }
                        } catch (e) {
                            // ignore parse errors for keep-alives etc
                        }
                    }
                }
            }

            // Finalize
            setMessages(prev => [...prev, { role: 'assistant', content: responseContent }]);
            setCurrentResponse('');

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                setMessages(prev => [...prev, { role: 'assistant', content: error.message, error: true }]);
            }
        } finally {
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    };

    const handleClear = () => {
        setMessages([]);
        setCurrentResponse('');
    };

    const selectedModel = models.find(m => m.id === selectedModelId);

    return (
        <div className="flex flex-col h-full relative">
            {/* Header / Config Bar */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-900/50 backdrop-blur z-10 rounded-t-xl">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-sm font-medium text-slate-200">
                            {selectedModel ? selectedModel.name : 'Select a model from the dock'}
                        </span>
                    </div>
                    {selectedModel?.type === 'api' && (
                        <span className="text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                            API
                        </span>
                    )}
                </div>

                <button
                    onClick={handleClear}
                    className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors text-xs"
                    title="Clear History"
                >
                    <Eraser size={14} />
                    <span>Clear</span>
                </button>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth pb-32"
            >
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50 select-none pb-20">
                        <Bot size={48} className="mb-4" />
                        <p className="text-lg">Chat with {selectedModel?.name || 'AI'}</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                ? 'bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-sm'
                                : msg.error
                                    ? 'bg-red-500/10 border border-red-500/30 text-red-200 rounded-tl-sm'
                                    : 'bg-slate-800/60 border border-slate-700/60 text-slate-200 rounded-tl-sm'
                            }`}>
                            <div className={`flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider ${msg.role === 'user' ? 'text-blue-300 flex-row-reverse' : 'text-slate-400'}`}>
                                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                {msg.role === 'user' ? 'You' : (selectedModel?.name || 'Assistant')}
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
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-800/60 border border-slate-700/60 text-slate-200">
                            <div className="flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                <Bot size={12} />
                                {selectedModel?.name || 'Assistant'}
                            </div>
                            <div className="prose prose-invert prose-sm max-w-none">
                                <FormattedContent text={currentResponse} />
                                <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse align-middle"></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <PromptInput
                inputRef={inputRef}
                inputFocused={inputFocused}
                setInputFocused={setInputFocused}
                onSendMessage={handleSend}
                onOpenTopics={onOpenTopics}
                className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-10 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent flex justify-center items-end"
                style={{}} // Override fixed positioning from default
                placeholder={selectedModelId ? `Message ${selectedModel?.name}...` : "Select a model to start chatting..."}
            />
        </div>
    );
}
