import { Square, ArrowUp, Puzzle } from 'lucide-react';

interface PromptInputProps {
  inputRef: React.RefObject<HTMLInputElement>;
  inputFocused: boolean;
  setInputFocused: (focused: boolean) => void;
  onSendMessage: (text: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  isGenerating?: boolean;
  onStop?: () => void;
  uiBuilderEnabled?: boolean;
  onToggleUiBuilder?: () => void;
}

export default function PromptInput({
  inputRef,
  inputFocused,
  setInputFocused,
  onSendMessage,
  className,
  style,
  placeholder,
  isGenerating,
  onStop,
  uiBuilderEnabled,
  onToggleUiBuilder,
}: PromptInputProps) {

  return (
    <div
      className={className ?? "fixed bottom-0 right-0 left-0 z-[100] pb-6 px-3 sm:px-4 flex justify-center items-end pointer-events-none transition-all duration-300"}
      style={style ?? {
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="w-full pointer-events-auto" style={{ maxWidth: '600px' }}>
        <div
          className={`rounded-xl p-2.5 transition-all duration-300 flex items-center gap-2 border border-slate-700/40 header-shell ${inputFocused ? 'prompt-panel-focused' : ''}`}
        >
          {onToggleUiBuilder && (
            <button
              onClick={onToggleUiBuilder}
              className={`p-2 rounded-lg transition-colors ${
                uiBuilderEnabled
                  ? 'text-violet-400 bg-violet-500/20'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
              }`}
              title="UI Builder - Enable interactive UI elements in responses"
            >
              <Puzzle size={16} />
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder || "Ask a question to compare model responses..."}
            className="w-full bg-transparent text-slate-200 placeholder-slate-500 outline-none text-base sm:text-sm px-2.5 py-2.5"
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
            onMouseDown={(e) => e.currentTarget.blur()}
            className={`min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] p-2 rounded-lg transition-colors active:scale-95 flex items-center justify-center focus:outline-none focus-visible:outline-none ${isGenerating
              ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            aria-label={isGenerating ? "Stop generation" : "Send message"}
          >
            {isGenerating ? (
              <Square className="w-5 h-5 sm:w-4 sm:h-4 fill-current" />
            ) : (
              <ArrowUp className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={2.5} />
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
