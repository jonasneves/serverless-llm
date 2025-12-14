import { useState, useRef, useEffect } from 'react';
import { Model } from '../types';
import FormattedContent from './FormattedContent';
import { Play, Square, Bot, AlertTriangle, User, Eraser } from 'lucide-react';

interface ChatViewProps {
    models: Model[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    githubToken?: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    error?: boolean;
}

export default function ChatView({
    models,
    selectedModelId,
    onSelectModel,
    githubToken
}: ChatViewProps) {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentResponse, setCurrentResponse] = useState('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, currentResponse, isGenerating]);

    const handleSend = async () => {
        if (!input.trim() || !selectedModelId || isGenerating) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
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

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsGenerating(false);
            // Save partial response
            if (currentResponse) {
                setMessages(prev => [...prev, { role: 'assistant', content: currentResponse }]);
                setCurrentResponse('');
            }
        }
    };

    const handleClear = () => {
        setMessages([]);
        setCurrentResponse('');
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white overflow-hidden relative">
            {/* Header / Config Bar */}
            <div className="flex items-center p-4 border-b border-white/10 gap-4 bg-slate-900/50 backdrop-blur top-0 z-10 justify-between">
                <div className="flex-1 max-w-xs">
                    <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider font-semibold">Model</label>
                    <select
                        value={selectedModelId || ''}
                        onChange={(e) => onSelectModel(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    >
                        <option value="" disabled>Select a model...</option>
                        {models.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.name} {m.type === 'api' ? '(API)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handleClear}
                    className="flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors text-sm"
                    title="Clear History"
                >
                    <Eraser size={16} />
                    <span>Clear</span>
                </button>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
            >
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50 select-none pb-20">
                        <Bot size={48} className="mb-4" />
                        <p className="text-lg">Select a model and start chatting.</p>
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
                                {msg.role === 'user' ? 'You' : (selectedModelId || 'Assistant')}
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
                                {selectedModelId || 'Assistant'}
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
            <div className="p-4 border-t border-white/10 bg-slate-900 z-20">
                <div className="relative max-w-4xl mx-auto">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        className="w-full bg-slate-800 text-white rounded-xl pl-4 pr-14 py-4 min-h-[60px] max-h-[200px] border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none shadow-lg"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={isGenerating}
                    />
                    <button
                        onClick={isGenerating ? handleStop : handleSend}
                        disabled={!selectedModelId && !isGenerating}
                        className={`absolute right-3 bottom-3 p-2 rounded-lg transition-all ${isGenerating
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                    >
                        {isGenerating ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
