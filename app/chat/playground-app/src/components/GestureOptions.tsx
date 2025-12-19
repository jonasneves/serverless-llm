import { useState, useEffect, useRef } from 'react';

interface GestureOption {
  id: string;
  label: string;
  action: 'message' | 'confirm' | 'choice';
  value: string;
}

interface GestureOptionsProps {
  content: string;
  onSelect: (value: string) => void;
}

const DWELL_TIME = 1800; // 1.8 seconds to select

export default function GestureOptions({ content, onSelect }: GestureOptionsProps) {
  const [options, setOptions] = useState<GestureOption[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState<Record<string, number>>({});
  const dwellStartRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    // Parse JSON from content
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        let jsonStr = jsonMatch[1];

        // Try to repair common JSON issues
        jsonStr = jsonStr
          .replace(/[\\']/g, '"') // Replace single quotes and escaped quotes with double quotes
          .replace(/,\s*}/g, '}') // Remove trailing commas before }
          .replace(/,\s*]/g, ']') // Remove trailing commas before ]
          .replace(/}\s*[\\]+\s*$/g, '}') // Remove trailing backslashes
          .replace(/"\s*"\s*$/g, '') // Remove extra quotes at end
          .trim();

        const data = JSON.parse(jsonStr);
        if (data.options && Array.isArray(data.options)) {
          // Validate each option has required fields
          const validOptions = data.options.filter((opt: any) =>
            opt.id && opt.label && opt.value
          );
          if (validOptions.length > 0) {
            setOptions(validOptions);
          } else {
            console.warn('No valid gesture options found in JSON');
          }
        }
      } catch (e) {
        console.error('Failed to parse gesture options:', e);
        console.error('JSON content:', jsonMatch[1]);
      }
    }
  }, [content]);

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

  return (
    <div className="w-full px-4">
      <div className="flex flex-col gap-3 items-center">
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
              className={`
                relative overflow-hidden rounded-xl font-medium text-sm
                border transition-all duration-200 w-[85%] max-w-[340px]
                text-left min-h-[44px] flex items-center px-5 py-3
                ${isHovered
                  ? 'bg-blue-500/20 border-blue-500/50 text-white shadow-lg shadow-blue-500/10'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/80 hover:border-slate-700/80'
                }
              `}
            >
              {/* Progress indicator */}
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
