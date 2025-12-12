type StatusIndicatorState = 'idle' | 'responding' | 'done' | 'waiting';

interface StatusIndicatorProps {
  state: StatusIndicatorState;
  color: string;
  size?: number;
  label?: string;
  className?: string;
}

const appendAlpha = (value: string, alpha: string) => {
  if (!value || !value.startsWith('#')) return value;
  if (value.length === 7 || value.length === 4) {
    return `${value}${alpha}`;
  }
  return value;
};

const defaultLabels: Record<StatusIndicatorState, string> = {
  idle: 'Ready',
  responding: 'Responding',
  done: 'Done',
  waiting: 'Waiting',
};

export default function StatusIndicator({
  state,
  color,
  size = 16,
  label,
  className = '',
}: StatusIndicatorProps) {
  const indicatorSizeStyle = { width: `${size}px`, height: `${size}px` };
  const tooltip = label ?? defaultLabels[state];
  const strokeWidth = Math.max(2, Math.round(size * 0.14));
  const iconSize = Math.max(12, size - 2);
  const processingColor = '#fbbf24'; // Warm amber for active processing
  const waitingColor = appendAlpha(color, 'cc');

  const renderCircle = () => {
    switch (state) {
      case 'responding':
        return (
          <div className="relative flex items-center justify-center" style={indicatorSizeStyle}>
            <svg
              width={iconSize}
              height={iconSize}
              viewBox="0 0 24 24"
              fill="none"
              className="animate-spin"
              style={{ filter: `drop-shadow(0 0 6px ${appendAlpha(processingColor, '55')})` }}
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke={appendAlpha(processingColor, '28')}
                strokeWidth={strokeWidth}
                fill="none"
              />
              <path
                d="M4.5 10.5a7.5 7.5 0 0 1 12.57-5.303L21 9M21 4.5V9h-4.5M19.5 13.5a7.5 7.5 0 0 1-12.57 5.303L3 15m0 4.5V15h4.5"
                stroke={processingColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      case 'done':
        return (
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              ...indicatorSizeStyle,
              background: appendAlpha(color, '14'),
              border: `1.5px solid ${appendAlpha(color, '70')}`,
            }}
          >
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <polyline
                points="5 13 10 18 19 7"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      case 'waiting':
        return (
          <div className="relative flex items-center justify-center" style={indicatorSizeStyle}>
            <div
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: appendAlpha(waitingColor, '35') }}
            />
            <svg
              width={iconSize}
              height={iconSize}
              viewBox="0 0 24 24"
              fill="none"
              style={{ animation: 'spin 5s linear infinite' }}
            >
              <circle
                cx="12"
                cy="12"
                r="8.5"
                stroke={appendAlpha(waitingColor, '44')}
                strokeWidth={strokeWidth - 1}
                strokeDasharray="6 10"
                strokeLinecap="round"
              />
            </svg>
            <div
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: appendAlpha(waitingColor, 'aa'),
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          </div>
        );
      default:
        return (
          <div className="relative flex items-center justify-center" style={indicatorSizeStyle}>
            <div
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: 'rgba(148, 163, 184, 0.25)' }}
            />
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: 'rgba(148, 163, 184, 0.6)',
                animation: 'pulse 2.4s ease-in-out infinite',
              }}
            />
          </div>
        );
    }
  };

  return (
    <div className={`inline-flex items-center justify-center ${className}`} title={tooltip}>
      {renderCircle()}
    </div>
  );
}
