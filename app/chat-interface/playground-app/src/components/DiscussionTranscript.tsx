import { useEffect, useRef } from 'react';
import { Model, ChatHistoryEntry } from '../types';
import FormattedContent from './FormattedContent';

interface DiscussionTranscriptProps {
    history: ChatHistoryEntry[];
    models: Model[];
    className?: string; // For layout positioning
}

export default function DiscussionTranscript({ history, models, className = '' }: DiscussionTranscriptProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when history changes
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [history.length, history[history.length - 1]?.content]);

    // Helper to find model by name (from the formatted string)
    const getModelByName = (name: string) => {
        return models.find(m => m.name === name); // Simple match
    };

    const renderEntry = (entry: ChatHistoryEntry, index: number) => {
        if (entry.role === 'user') {
            return (
                <div key={index} className="flex justify-end mb-6">
                    <div className="max-w-[85%] bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tr-sm px-4 py-3 text-slate-100">
                        <div className="text-[10px] text-blue-300 uppercase tracking-wider mb-1 font-bold text-right">You</div>
                        <div className="whitespace-pre-wrap text-sm">{entry.content}</div>
                    </div>
                </div>
            );
        }

        // Handle Assistant / System messages based on 'kind'
        const isChairman = entry.kind === 'council_chairman'
            || entry.kind === 'council_synthesis'
            || entry.kind === 'council_ranking'
            || entry.kind === 'roundtable_synthesis'
            || entry.kind === 'roundtable_analysis'
            || entry.kind === 'compare_summary';

        if (isChairman) {
            // Parse content if it has "Name: " prefix (like chairman quips)
            let name = 'Chairman';
            let text = entry.content;

            const colonIdx = entry.content.indexOf(':');
            if (entry.kind === 'council_chairman' && colonIdx !== -1 && colonIdx < 30) {
                name = entry.content.slice(0, colonIdx).trim();
                text = entry.content.slice(colonIdx + 1).trim();
            } else if (entry.kind === 'compare_summary') {
                name = 'Summary';
            } else if (entry.kind === 'council_ranking') {
                name = 'Council Vote Results';
                // Remove prefix if present
                if (text.startsWith('Anonymous Rankings:\n')) {
                    text = text.replace('Anonymous Rankings:\n', '');
                }
            }

            return (
                <div key={index} className="flex justify-center mb-6">
                    <div className="max-w-[90%] w-full bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 mb-2 justify-center">
                            <span className="text-[10px] uppercase tracking-widest text-orange-400 font-bold">
                                {name}
                            </span>
                            <div className="h-px flex-1 bg-slate-700/50"></div>
                        </div>
                        <div className="text-slate-300 text-sm italic text-center">
                            <FormattedContent text={text} showThinking={false} />
                        </div>
                    </div>
                </div>
            );
        }

        // Handle Model Turns (Name:\nContent)
        if (entry.kind === 'council_turn' || entry.kind === 'roundtable_turn') {
            // Expected format: "Name [· Round X]:\nContent"
            const firstLineEnd = entry.content.indexOf('\n');
            let header = 'Model';
            let body = entry.content;

            if (firstLineEnd !== -1) {
                header = entry.content.slice(0, firstLineEnd).trim();
                body = entry.content.slice(firstLineEnd + 1).trim();
            }

            // Try to extract pure name for color lookup
            // Remove " · Round X" etc.
            const cleanName = header.split('·')[0].split(':')[0].trim();
            const model = getModelByName(cleanName);
            const color = model?.color || '#94a3b8'; // slate-400 fallback

            return (
                <div key={index} className="flex flex-col items-start mb-6 max-w-[90%]">
                    <div className="flex items-center gap-2 mb-1 pl-1">
                        <div
                            className="w-4 h-4 rounded-full border border-white/10 shadow-sm"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-bold text-slate-300">{header.replace(':', '')}</span>
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-200 w-full">
                        <FormattedContent text={body} showThinking={false} />
                    </div>
                </div>
            );
        }

        // Fallback for standard assistant messages (Compare mode normal replies, though they are usually not in history list effectively in this app's current flow, user only sees latest)
        // But if we do show generic history:
        return (
            <div key={index} className="flex items-start mb-6">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-200">
                    <FormattedContent text={entry.content} />
                </div>
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className={`flex-1 overflow-y-auto px-4 py-6 scroll-smooth ${className}`}
            data-no-arena-scroll // Prevent arena scroll capture
        >
            <div className="max-w-3xl mx-auto flex flex-col justify-end min-h-full">
                {history.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-slate-500 italic pb-20">
                        Start a discussion to see the transcript.
                    </div>
                )}
                {history.map(renderEntry)}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
