import { useState, useEffect } from 'react';
import { Hand, X, Camera, ThumbsUp, ThumbsDown, MoveVertical, MousePointerClick, Sparkles, Info } from 'lucide-react';
import HandBackground from './HandBackground';

const STORAGE_KEY = 'gesture-control-skip-intro';

interface GestureControlProps {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
}

export default function GestureControl(props: GestureControlProps) {
  const [isActive, setIsActive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Load preference from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      setSkipIntro(true);
    }
  }, []);

  const toggle = () => {
    if (isActive) {
      setIsActive(false);
      setShowTooltip(false);
    } else {
      if (skipIntro) {
        // Skip modal, go directly to camera
        setIsActive(true);
        setShowTooltip(true);
        // Auto-hide tooltip after 5 seconds
        setTimeout(() => setShowTooltip(false), 5000);
      } else {
        setShowModal(true);
      }
    }
  };

  const startCamera = (rememberChoice: boolean = false) => {
    if (rememberChoice) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setSkipIntro(true);
    }
    setShowModal(false);
    setIsActive(true);
    // Show tooltip briefly when starting
    setShowTooltip(true);
    setTimeout(() => setShowTooltip(false), 4000);
  };

  const resetPreference = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSkipIntro(false);
    setShowTooltip(false);
  };

  const baseClasses = "fixed bottom-36 sm:bottom-5 right-3 sm:right-5 z-50 flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 border shadow-sm hover:shadow-md active:scale-95";
  const activeClasses = "bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500";
  const inactiveClasses = "bg-slate-900/80 backdrop-blur-md border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-600";

  return (
    <>
      {/* Floating Tooltip - shown when gesture control is active and user has skipped intro */}
      {isActive && showTooltip && (
        <div
          className="fixed bottom-52 sm:bottom-[72px] right-3 sm:right-5 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300"
          style={{ maxWidth: '220px' }}
        >
          <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-xl p-3 relative">
            {/* Arrow pointing down */}
            <div className="absolute bottom-0 right-4 transform translate-y-full">
              <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-700/80" />
            </div>

            <div className="flex items-start gap-2 mb-2">
              <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
              <span className="text-xs text-slate-300 font-medium">Gesture Controls</span>
              <button
                onClick={() => setShowTooltip(false)}
                className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={12} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Sparkles size={10} className="text-yellow-400" /> Wave → Hi
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <Hand size={10} className="text-red-400" /> Palm → Stop
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <ThumbsUp size={10} className="text-green-400" /> Up → Yes
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <ThumbsDown size={10} className="text-orange-400" /> Down → No
              </div>
            </div>

            <button
              onClick={resetPreference}
              className="mt-2 w-full text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Show full guide on next start
            </button>
          </div>
        </div>
      )}

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
                  icon={<Sparkles size={18} className="text-yellow-400" />}
                  label="Wave"
                  desc="Send 'Hi'"
                />
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
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => startCamera(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                  >
                    Enable Camera
                  </button>
                </div>
                <button
                  onClick={() => startCamera(true)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <span>Enable & Don't Show Again</span>
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
