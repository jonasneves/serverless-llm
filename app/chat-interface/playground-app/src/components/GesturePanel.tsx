import GestureOptions from './GestureOptions';

interface GesturePanelProps {
  content: string | null;
  onSelect: (value: string) => void;
}

export default function GesturePanel({ content, onSelect }: GesturePanelProps) {
  return (
    <div className="w-[400px] xl:w-[480px] flex flex-col border-l border-white/5 bg-slate-900/20 backdrop-blur-sm z-40 relative h-full">
      <div className="flex-1 flex flex-col overflow-y-auto px-4 py-6 scroll-smooth [mask-image:linear-gradient(to_bottom,transparent_0%,black_2rem,black_100%)]">
        {content ? (
          <div className="flex-1 flex items-start pt-16">
            <GestureOptions content={content} onSelect={onSelect} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4 animate-pulse">👋</div>
              <p className="text-slate-400 text-sm mb-4">Wave to say hi</p>
              <p className="text-slate-500 text-xs">Options will appear here when available</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
