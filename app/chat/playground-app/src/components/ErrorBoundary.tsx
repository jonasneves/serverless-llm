import { Component, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary for catching React errors including lazy load failures.
 * Provides a retry button to recover without full page refresh.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full text-white/70 gap-4 p-6">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={20} />
            <span className="text-sm font-medium">Something went wrong</span>
          </div>
          <p className="text-xs text-white/40 text-center max-w-xs">
            {this.state.error?.message || 'Failed to load component'}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/80 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-all active:scale-95 border border-slate-600/50"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

