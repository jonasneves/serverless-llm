type StatusIndicatorState = 'idle' | 'responding' | 'done' | 'waiting' | 'error';

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
  error: 'Error',
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
              className=""
              style={{
                filter: `drop-shadow(0 0 6px ${appendAlpha(processingColor, '55')})`,
                animation: 'spin 0.6s linear infinite'
              }}
            >
              <defs>
                {/* Gradient that fades from bright (head) to transparent (tail) */}
                <linearGradient id="spinnerGradient" gradientUnits="userSpaceOnUse" x1="3" y1="12" x2="12" y2="3">
                  <stop offset="0%" stopColor={processingColor} stopOpacity="1" />
                  <stop offset="60%" stopColor={processingColor} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={processingColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Background ring - very faint */}
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke={appendAlpha(processingColor, '15')}
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Main arc with gradient fade */}
              <path
                d="M 12 3 A 9 9 0 1 1 3 12"
                stroke="url(#spinnerGradient)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="none"
              />
              {/* Bright head dot for emphasis */}
              <circle
                cx="3"
                cy="12"
                r={strokeWidth * 0.7}
                fill={processingColor}
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
      case 'error':
        const errorColor = '#ef4444';
        return (
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              ...indicatorSizeStyle,
              background: appendAlpha(errorColor, '14'),
              border: `1.5px solid ${appendAlpha(errorColor, '70')}`,
            }}
          >
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6L18 18M6 18L18 6"
                stroke={errorColor}
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
