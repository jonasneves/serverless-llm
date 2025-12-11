import { SUGGESTED_TOPICS } from '../constants';

interface PromptInputProps {
  inputRef: React.RefObject<HTMLInputElement>;
  inputFocused: boolean;
  setInputFocused: (focused: boolean) => void;
  onSendMessage: (text: string) => void;
  mode: string;
}

export default function PromptInput({
  inputRef,
  inputFocused,
  setInputFocused,
  onSendMessage,
  mode
}: PromptInputProps) {
  
  return (
    <div 
      className="fixed bottom-0 right-0 z-[100] pb-6 px-4 flex justify-center items-end pointer-events-none transition-all duration-300"
      style={{
        left: '0', // Static left, independent of dock
        background: 'linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.8) 50%, transparent 100%)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div className="max-w-2xl w-full pointer-events-auto">
        {/* Scenarios Ticker */}
        <div 
          className="mb-4 relative overflow-hidden h-6 w-full"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)'
          }}
        >
          <div className="absolute whitespace-nowrap animate-ticker flex gap-2 items-center text-[11px] text-slate-400 font-medium">
            {[...SUGGESTED_TOPICS, ...SUGGESTED_TOPICS, ...SUGGESTED_TOPICS].map((s, i) => ( // Repeat for infinite scroll effect
              <div key={i} className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (inputRef.current) inputRef.current.value = s.prompt;
                    onSendMessage(s.prompt);
                  }}
                  className="hover:text-blue-400 transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-white/5"
                >
                  {s.label}
                </button>
                <span className="text-slate-700">•</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-xl p-4 transition-all duration-300"
          style={{
            background: 'rgba(30, 41, 59, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: inputFocused ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(71, 85, 105, 0.4)',
            boxShadow: inputFocused
              ? '0 4px 20px rgba(0,0,0,0.4), 0 0 20px rgba(59, 130, 246, 0.15)'
              : '0 4px 20px rgba(0,0,0,0.3)'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask a question to compare model responses..."
            className="w-full bg-transparent text-slate-200 placeholder-slate-500 outline-none text-sm"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputRef.current?.value) {
                  onSendMessage(inputRef.current.value);
                  inputRef.current.value = '';
                }
              }
            }}
          />
        </div>
        {/* Footer hint */}
        <div className="text-center mt-2 text-[10px] text-slate-600">
          {mode !== 'compare' ? "Click on models to expand their responses" : "Showing all model responses"}
        </div>
      </div>
    </div>
  );
}
