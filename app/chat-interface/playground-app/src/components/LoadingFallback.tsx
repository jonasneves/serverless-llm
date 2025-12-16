import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

interface LoadingFallbackProps {
  message?: string;
  /** Time in ms before showing "stuck" state with retry option. Default: 8000ms */
  timeout?: number;
  onRetry?: () => void;
}

/**
 * Loading fallback with timeout detection.
 * Shows a loading spinner initially, then after timeout shows a "stuck" state
 * with a retry button so users don't have to refresh the whole page.
 */
export default function LoadingFallback({ 
  message = 'Loading...', 
  timeout = 8000,
  onRetry 
}: LoadingFallbackProps) {
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStuck(true);
    }, timeout);

    return () => clearTimeout(timer);
  }, [timeout]);

  const handleRetry = () => {
    setIsStuck(false);
    if (onRetry) {
      onRetry();
    } else {
      // Default: reload the page
      window.location.reload();
    }
  };

  if (isStuck) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/70 gap-4 p-6">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle size={18} />
          <span className="text-sm font-medium">Taking longer than expected</span>
        </div>
        <p className="text-xs text-white/40 text-center max-w-xs">
          The component is having trouble loading. This could be a network issue.
        </p>
        <button
          onClick={handleRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/80 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-all active:scale-95 border border-slate-600/50"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-white/50 gap-2">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

