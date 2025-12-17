import { Hand } from 'lucide-react';
import GestureOptions from './GestureOptions';

interface GesturePanelProps {
  content: string | null;
  onSelect: (value: string) => void;
}

export default function GesturePanel({ content, onSelect }: GesturePanelProps) {
  return (
    <div className="w-[400px] xl:w-[480px] flex flex-col border-l border-white/5 bg-slate-900/20 backdrop-blur-sm z-40 relative h-full">
      <div className="flex-1 flex flex-col pt-24 pb-6 px-4">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700/50">
          <Hand size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Gesture Options
          </h2>
        </div>

        {content ? (
          <div className="flex-1 flex items-start pt-8">
            <GestureOptions content={content} onSelect={onSelect} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-500 text-sm">
              <Hand size={32} className="mx-auto mb-2 opacity-50" />
              <p>Point at options when available</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
