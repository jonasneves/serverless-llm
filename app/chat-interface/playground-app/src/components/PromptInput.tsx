import { SUGGESTED_TOPICS } from '../constants';
import { Square, ArrowUp } from 'lucide-react';

interface PromptInputProps {
  inputRef: React.RefObject<HTMLInputElement>;
  inputFocused: boolean;
  setInputFocused: (focused: boolean) => void;
  onSendMessage: (text: string) => void;
  onOpenTopics: () => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  isGenerating?: boolean;
  onStop?: () => void;
}

export default function PromptInput({
  inputRef,
  inputFocused,
  setInputFocused,
  onSendMessage,
  onOpenTopics,
  className,
  style,
  placeholder,
  isGenerating,
  onStop,
}: PromptInputProps) {

  return (
    <div
      className={className ?? "fixed bottom-0 right-0 left-0 z-[100] pb-6 px-3 sm:px-4 flex justify-center items-end pointer-events-none transition-all duration-300"}
      style={style ?? {
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-3xl w-full pointer-events-auto">
        {/* Scenarios Ticker + Explorer */}
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={onOpenTopics}
            className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-900/70 text-slate-200 hover:text-white hover:border-blue-400/60 hover:bg-blue-500/10 transition-colors active:scale-95 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3l2.09 6.26H20l-5.09 3.7 2.09 6.26L12 15.52l-5 3.7 2-6.26L4 9.26h5.91z" />
            </svg>
            Explore topics
          </button>
          <div
            className="relative overflow-hidden h-6 w-full backdrop-blur-md bg-slate-900/40 rounded-lg border border-white/5 ticker-mask"
          >
            <div className="absolute whitespace-nowrap animate-ticker flex gap-2 items-center text-[11px] text-slate-300 font-medium h-full px-4">
              {[...SUGGESTED_TOPICS, ...SUGGESTED_TOPICS, ...SUGGESTED_TOPICS].map((s, i) => ( // Repeat for infinite scroll effect
                <div key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (inputRef.current) {
                        inputRef.current.value = s.prompt;
                        inputRef.current.focus();
                      }
                    }}
                    className="hover:text-blue-400 transition-colors cursor-pointer px-2 py-1 sm:px-1 sm:py-0.5 rounded hover:bg-white/5 active:scale-95"
                  >
                    {s.label}
                  </button>
                  <span className="text-slate-600">•</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`prompt-panel rounded-xl p-4 transition-all duration-300 flex items-center gap-2 ${inputFocused ? 'prompt-panel-focused' : ''}`}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder || "Ask a question to compare model responses..."}
            className="w-full bg-transparent text-slate-200 placeholder-slate-500 outline-none text-sm"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isGenerating) {
                  return; // Don't send if generating, maybe? Or allow queuing? Typically block.
                }
                if (inputRef.current?.value) {
                  onSendMessage(inputRef.current.value);
                  inputRef.current.value = '';
                }
              }
            }}
            disabled={isGenerating}
          />
          <button
            onClick={() => {
              if (isGenerating) {
                onStop?.();
              } else {
                if (inputRef.current?.value) {
                  onSendMessage(inputRef.current.value);
                  inputRef.current.value = '';
                }
              }
            }}
            className={`min-w-[44px] min-h-[44px] p-2 rounded-lg transition-colors active:scale-95 flex items-center justify-center ${isGenerating
                ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            aria-label={isGenerating ? "Stop generation" : "Send message"}
          >
            {isGenerating ? (
              <Square className="w-6 h-6 sm:w-5 sm:h-5 fill-current" />
            ) : (
              <ArrowUp className="w-6 h-6 sm:w-5 sm:h-5" />
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
