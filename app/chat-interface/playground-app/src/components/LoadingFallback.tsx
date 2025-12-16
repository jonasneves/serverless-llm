import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadingFallbackProps {
  message?: string;
  timeout?: number;
}

export default function LoadingFallback({ message = "Loading...", timeout = 3000 }: LoadingFallbackProps) {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRetry(true);
    }, timeout);
    return () => clearTimeout(timer);
  }, [timeout]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="text-white/50 animate-pulse">{message}</div>
      
      {showRetry && (
        <div className="flex flex-col items-center gap-2 animate-in fade-in duration-500">
          <span className="text-white/30 text-xs">Taking longer than expected?</span>
          <button 
             className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-md text-sm text-slate-300 transition-all hover:text-white"
             onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} />
            Reload Page
          </button>
        </div>
      )}
    </div>
  );
}
