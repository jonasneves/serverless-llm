export interface ExecutionTimeData {
  startTime: number;
  firstTokenTime?: number;
  endTime?: number;
}

interface ExecutionTimeDisplayProps {
  times?: ExecutionTimeData;
}

export default function ExecutionTimeDisplay({ times }: ExecutionTimeDisplayProps) {
  const hasStart = times?.startTime != null;
  const hasEnd = times?.endTime != null;
  const hasFirstToken = times?.firstTokenTime != null;

  const totalSeconds = hasStart && hasEnd
    ? ((times!.endTime! - times!.startTime) / 1000).toFixed(2)
    : null;

  const ttftSeconds = hasStart && hasFirstToken
    ? ((times!.firstTokenTime! - times!.startTime) / 1000).toFixed(2)
    : null;

  return (
    <div className="text-[10px] text-slate-500">
      <span className="text-slate-400">TIME</span>{' '}
      {totalSeconds
        ? `${totalSeconds}s`
        : hasStart && !hasEnd
          ? '...'
          : '—'}
      {ttftSeconds && (
        <span className="ml-2 text-slate-600">
          TTFT {ttftSeconds}s
        </span>
      )}
    </div>
  );
}

