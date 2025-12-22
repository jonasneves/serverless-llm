import { useState, useRef, useEffect } from 'react';
import { useGestureOptions } from '../hooks/useGestureOptions';

interface GestureOptionsProps {
  content: string;
  onSelect: (value: string) => void;
  isInline?: boolean;
}

const DWELL_TIME = 1800;

export default function GestureOptions({ content, onSelect, isInline = false }: GestureOptionsProps) {
  const options = useGestureOptions(content);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState<Record<string, number>>({});
  const dwellStartRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    // Listen for gesture hover events
    const handleGestureHover = (e: CustomEvent) => {
      const target = e.detail?.target;
      if (target && target.hasAttribute('data-gesture-option')) {
        const optionId = target.getAttribute('data-gesture-option');
        if (optionId && optionId !== hoveredId) {
          setHoveredId(optionId);
          startDwellTimer(optionId);
        }
      } else if (hoveredId) {
        setHoveredId(null);
        stopDwellTimer();
      }
    };

    window.addEventListener('gesture-hover' as any, handleGestureHover);
    return () => {
      window.removeEventListener('gesture-hover' as any, handleGestureHover);
      stopDwellTimer();
    };
  }, [hoveredId]);

  const startDwellTimer = (optionId: string) => {
    stopDwellTimer();
    dwellStartRef.current = Date.now();

    const updateProgress = () => {
      const elapsed = Date.now() - dwellStartRef.current;
      const progress = Math.min((elapsed / DWELL_TIME) * 100, 100);

      setDwellProgress(prev => ({ ...prev, [optionId]: progress }));

      if (progress >= 100) {
        const option = options.find(opt => opt.id === optionId);
        if (option) {
          onSelect(option.value);
          stopDwellTimer();
        }
      } else {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);
  };

  const stopDwellTimer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setDwellProgress({});
  };

  const handleMouseEnter = (optionId: string) => {
    setHoveredId(optionId);
    startDwellTimer(optionId);
  };

  const handleMouseLeave = () => {
    setHoveredId(null);
    stopDwellTimer();
  };

  if (options.length === 0) return null;

  const containerClasses = isInline
    ? "w-full mt-3"
    : "w-full";

  const gridClasses = isInline
    ? "grid grid-cols-2 gap-2"
    : "flex flex-col gap-2.5";

  const buttonClasses = (isHovered: boolean) => isInline
    ? `relative overflow-hidden rounded-lg font-medium text-xs border transition-all duration-200 text-center min-h-[40px] flex items-center justify-center px-3 py-2 ${isHovered
      ? 'bg-blue-500/20 border-blue-500/50 text-white shadow-lg shadow-blue-500/10'
      : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/80 hover:border-slate-700/80'
    }`
    : `relative overflow-hidden rounded-xl font-medium text-sm border transition-all duration-200 w-full text-left min-h-[52px] flex items-center px-4 py-3 ${isHovered
      ? 'bg-blue-500/20 border-blue-500/50 text-white shadow-lg shadow-blue-500/10 scale-[1.02]'
      : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/80 hover:border-slate-700/80'
    }`;

  return (
    <div className={containerClasses}>
      {!isInline && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quick Actions</div>
          <div className="flex-1 h-px bg-gradient-to-r from-slate-700/50 to-transparent"></div>
        </div>
      )}
      <div className={gridClasses}>
        {options.map((option) => {
          const progress = dwellProgress[option.id] || 0;
          const isHovered = hoveredId === option.id;

          return (
            <button
              key={option.id}
              onClick={() => onSelect(option.value)}
              onMouseEnter={() => handleMouseEnter(option.id)}
              onMouseLeave={handleMouseLeave}
              data-gesture-option={option.id}
              className={buttonClasses(isHovered)}
            >
              {isHovered && progress > 0 && (
                <div
                  className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-75"
                  style={{ width: `${progress}%` }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Helper function to extract text without JSON blocks
export function extractTextWithoutJSON(content: string): string {
  return content.replace(/```json[\s\S]*?```/g, '').trim();
}
