import { useState } from 'react';
import { Hand, X, Camera, ThumbsUp, ThumbsDown, MoveVertical, MousePointerClick } from 'lucide-react';
import HandBackground from './HandBackground';

interface GestureControlProps {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onModeSwitch?: (direction: 'next' | 'prev') => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
}

export default function GestureControl(props: GestureControlProps) {
  const [isActive, setIsActive] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const toggle = () => {
    if (isActive) {
      setIsActive(false);
    } else {
      setShowModal(true);
    }
  };

  const startCamera = () => {
    setShowModal(false);
    setIsActive(true);
  };

  const baseClasses = "fixed bottom-5 right-5 z-50 flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 border shadow-sm hover:shadow-md active:scale-95";
  const activeClasses = "bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500";
  const inactiveClasses = "bg-slate-900/80 backdrop-blur-md border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-600";

  return (
    <>
      <button
        onClick={toggle}
        className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        title={isActive ? "Stop Gesture Control" : "Start Gesture Control"}
      >
        {isActive ? (
          <X size={18} />
        ) : (
          <Hand size={18} />
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowModal(false)}
          />

          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                  <Camera size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-100">Hand Control</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Control the playground using hand gestures via your webcam.
                <span className="block mt-1 text-xs text-slate-500">Processing happens locally in your browser.</span>
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <GestureCard
                  icon={<Hand size={18} className="text-red-400" />}
                  label="Open Palm"
                  desc="Stop Generation"
                />
                <GestureCard
                  icon={<ThumbsUp size={18} className="text-green-400" />}
                  label="Thumbs Up"
                  desc="Send 'Yes'"
                />
                <GestureCard
                  icon={<ThumbsDown size={18} className="text-orange-400" />}
                  label="Thumbs Down"
                  desc="Send 'No'"
                />
                <GestureCard
                  icon={<MoveVertical size={18} className="text-purple-400" />}
                  label="Fist Pull"
                  desc="Scroll Page"
                />
                <GestureCard
                  icon={<MousePointerClick size={18} className="text-pink-400" />}
                  label="Tap Index"
                  desc="Click Element"
                />
                {/* Pinch also works as a click, but Tap is clearer now. 
                    I'll update the label for the last card to reflect 'Tap Index' or 'Point & Tap' as well, 
                    since Pinch/Tap map to the same onPinch event but the user instruction was about Index Poking. 
                    Actually, let's keep it simple. Index Tap is "Tap". 
                    The previous "Pinch" card can be renamed to "Index Tap" or just kept as "Tap".
                    Wait, "Pinch" logic is still in HandBackground? Yes, it is. But user asked for Poking.
                    I will rename the last card to "Index Tap" and change icon if needed, 
                    to reflect the primary way we want them to click.
                */}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={startCamera}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                >
                  Enable Camera
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isActive && (
        <HandBackground {...props} />
      )}
    </>
  );
}

function GestureCard({ icon, label, desc }: { icon: React.ReactNode, label: string, desc: string }) {
  return (
    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 flex flex-col items-center text-center gap-1.5 hover:bg-slate-800 transition-colors">
      <div className="mb-0.5">{icon}</div>
      <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">{label}</span>
      <span className="text-[10px] text-slate-500">{desc}</span>
    </div>
  );
}
