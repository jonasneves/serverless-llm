import { useEffect, useCallback } from 'react';
import type { Model } from '../types';
import { ExecutionTimeData } from './ExecutionTimeDisplay';
import FormattedContent from './FormattedContent';

interface ResponseModalProps {
  model: Model | null;
  executionTimes?: ExecutionTimeData;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export default function ResponseModal({
  model,
  executionTimes,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: ResponseModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
      onPrev();
    } else if (e.key === 'ArrowRight' && hasNext && onNext) {
      onNext();
    }
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!model) return null;

  const typeColor = model.type === 'self-hosted' ? '#10b981' : '#3b82f6';
  const hasThinking = Boolean(model.thinking && model.thinking.trim().length > 0);

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(model.response);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[800px] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/98 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Response from ${model.name}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: typeColor }}
            />
            <h2 className="text-base font-semibold text-slate-100">{model.name}</h2>
            <span
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                model.type === 'self-hosted'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
              }`}
            >
              {model.type === 'self-hosted' ? 'Self-hosted' : 'API'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Navigation arrows */}
            {(hasPrev || hasNext) && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
                  disabled={!hasPrev}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous model"
                  title="Previous (Left Arrow)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onNext?.(); }}
                  disabled={!hasNext}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next model"
                  title="Next (Right Arrow)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
            {/* Copy button */}
            <button
              onClick={copyToClipboard}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              aria-label="Copy response"
              title="Copy to clipboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              aria-label="Close"
              title="Close (Esc)"
            >
              <span className="text-xl leading-none">&times;</span>
            </button>
          </div>
        </div>

        {/* Execution times bar */}
        {executionTimes && (
          <div className="flex items-center gap-4 px-5 py-2 border-b border-slate-800/40 text-xs text-slate-400 bg-slate-900/50">
            {executionTimes.firstTokenTime && executionTimes.startTime && (
              <span>
                TTFT: <span className="text-slate-300">{formatTime(executionTimes.firstTokenTime - executionTimes.startTime)}</span>
              </span>
            )}
            {executionTimes.endTime && executionTimes.startTime && (
              <span>
                Total: <span className="text-slate-300">{formatTime(executionTimes.endTime - executionTimes.startTime)}</span>
              </span>
            )}
            {executionTimes.endTime && executionTimes.firstTokenTime && model.response && (
              <span>
                Speed: <span className="text-slate-300">
                  {Math.round(model.response.length / ((executionTimes.endTime - executionTimes.firstTokenTime) / 1000))} chars/s
                </span>
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {model.error ? (
            <div className="text-red-400 text-sm">
              <span className="font-semibold">Error:</span> {model.error}
            </div>
          ) : model.response ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <FormattedContent
                text={model.response}
                thinkingText={model.thinking}
                showThinking={hasThinking}
              />
            </div>
          ) : (
            <div className="text-slate-500 italic">No response yet.</div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-2 border-t border-slate-800/40 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Press Esc to close{(hasPrev || hasNext) ? ', Arrow keys to navigate' : ''}</span>
          {model.response && (
            <span>{model.response.length.toLocaleString()} characters</span>
          )}
        </div>
      </div>
    </div>
  );
}
