import { Loader2, X, Check } from 'lucide-react';
import { ModelResponse } from './ChatView';

interface ResponseTabsProps {
    primaryModelName: string;
    alternateResponses?: ModelResponse[];
    activeResponseIndex: number;
    messageIndex: number;
    onSetActiveResponse: (messageIndex: number, responseIndex: number) => void;
    onCancelComparison: (messageIndex: number, modelId: string) => void;
}

export default function ResponseTabs({
    primaryModelName,
    alternateResponses,
    activeResponseIndex,
    messageIndex,
    onSetActiveResponse,
    onCancelComparison
}: ResponseTabsProps) {
    if (!alternateResponses || alternateResponses.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-1 mb-2 -mt-1">
            <button
                onClick={(e) => { e.stopPropagation(); onSetActiveResponse(messageIndex, 0); }}
                className={`px-2 py-0.5 text-[9px] rounded-full transition-colors ${activeResponseIndex === 0
                        ? 'bg-slate-600/60 text-white'
                        : 'bg-slate-700/30 text-slate-400 hover:text-slate-200'
                    }`}
            >
                {primaryModelName}
            </button>
            {alternateResponses.map((alt, altIdx) => (
                <div key={alt.modelId} className="flex items-center">
                    <button
                        onClick={(e) => { e.stopPropagation(); onSetActiveResponse(messageIndex, altIdx + 1); }}
                        className={`px-2 py-0.5 text-[9px] rounded-full transition-colors flex items-center gap-1 ${activeResponseIndex === altIdx + 1
                                ? 'bg-slate-600/60 text-white'
                                : 'bg-slate-700/30 text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        {alt.loading && <Loader2 size={8} className="animate-spin" />}
                        {alt.modelName}
                    </button>
                    {/* Cancel button for loading tabs */}
                    {alt.loading && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onCancelComparison(messageIndex, alt.modelId); }}
                            className="ml-0.5 p-0.5 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                            title="Cancel"
                        >
                            <X size={8} />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
