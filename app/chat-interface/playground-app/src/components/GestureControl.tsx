import { useState, useEffect, useCallback } from 'react';
import { Hand, X, Camera, ThumbsUp, ThumbsDown, MoveVertical, MousePointerClick, Sparkles, HelpCircle, Check } from 'lucide-react';
import HandBackground from './HandBackground';
import GestureDebugPanel, { GestureConfig, DEFAULT_GESTURE_CONFIG } from './GestureDebugPanel';

const STORAGE_KEY = 'gesture-control-skip-intro';
const DEBUG_CONFIG_KEY = 'gesture-debug-config';

interface GestureControlProps {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  transcriptPanelOpen?: boolean;
}

export default function GestureControl({ transcriptPanelOpen = false, ...props }: GestureControlProps) {
  const [isActive, setIsActive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [gestureState, setGestureState] = useState<{
    gesture: string | null;
    progress: number;
    triggered: boolean;
  }>({ gesture: null, progress: 0, triggered: false });
  const [flashTrigger, setFlashTrigger] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Debug panel state
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [mouseSimulation, setMouseSimulation] = useState(false);
  const [gestureConfig, setGestureConfig] = useState<GestureConfig>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DEBUG_CONFIG_KEY);
      if (saved) {
        try { return JSON.parse(saved); } catch { }
      }
    }
    return DEFAULT_GESTURE_CONFIG;
  });
  const [debugInfo, setDebugInfo] = useState<{
    indexExtended: boolean;
    middleExtended: boolean;
    ringExtended: boolean;
    pinkyExtended: boolean;
    wasPointingOnly: boolean;
    twoFingerFrames: number;
    clickLocked: boolean;
  } | undefined>(undefined);
  const [landmarkData, setLandmarkData] = useState<{
    landmarks: Array<{ x: number; y: number; z: number }> | null;
    handedness: 'Left' | 'Right' | null;
  } | undefined>(undefined);
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    fps: number;
    detectionTime: number;
  } | undefined>(undefined);

  // Load preference from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      setSkipIntro(true);
    }
  }, []);

  // Close tooltip on ESC key or click outside
  useEffect(() => {
    if (!showTooltip) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTooltip(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking the help button or the tooltip itself
      if (target.closest('[data-tooltip]') || target.closest('[data-help-button]')) {
        return;
      }
      setShowTooltip(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [showTooltip]);

  // Handle gesture state updates
  const handleGestureState = (state: { gesture: string | null; progress: number; triggered: boolean }) => {
    setGestureState(state);
    if (state.triggered) {
      setFlashTrigger(true);
      setTimeout(() => setFlashTrigger(false), 300);
    }
  };

  // Handle camera errors
  const handleCameraError = (message: string) => {
    setCameraError(message);
    setIsActive(false); // Deactivate gesture control
    // Auto-dismiss after 5 seconds
    setTimeout(() => setCameraError(null), 5000);
  };

  const toggle = () => {
    if (isActive) {
      setIsActive(false);
      setShowTooltip(false);
    } else {
      if (skipIntro) {
        // Skip modal, go directly to camera
        setIsActive(true);
      } else {
        setShowModal(true);
      }
    }
  };

  const toggleTooltip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip(prev => !prev);
  };

  const startCamera = () => {
    if (rememberChoice) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setSkipIntro(true);
    }
    setShowModal(false);
    setIsActive(true);
    setRememberChoice(false);
  };

  const resetPreference = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSkipIntro(false);
    setShowTooltip(false);
  };

  // Save gesture config to localStorage when changed
  const handleConfigChange = useCallback((newConfig: GestureConfig) => {
    setGestureConfig(newConfig);
    localStorage.setItem(DEBUG_CONFIG_KEY, JSON.stringify(newConfig));
  }, []);

  // Mouse simulation - use mouse position as finger pointer
  useEffect(() => {
    if (!mouseSimulation) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Simulate hover at mouse position
      if (props.onHover) {
        props.onHover(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
      }
      // Update gesture state to show pointing
      setGestureState({ gesture: 'POINTING', progress: 0, triggered: false });
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Don't simulate click on UI elements
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[data-debug-panel]')) {
        return;
      }
      // Simulate two-finger tap (click)
      setGestureState({ gesture: 'TWO_FINGER_POINT', progress: 0.5, triggered: false });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[data-debug-panel]')) {
        return;
      }
      // Trigger click
      if (props.onPinch) {
        props.onPinch(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
      }
      setGestureState({ gesture: 'TWO_FINGER_TAP', progress: 1, triggered: true });
      setFlashTrigger(true);
      setTimeout(() => setFlashTrigger(false), 300);
      setTimeout(() => {
        setGestureState({ gesture: 'POINTING', progress: 0, triggered: false });
      }, 100);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [mouseSimulation, props.onHover, props.onPinch]);

  // Handle debug info updates from HandBackground
  const handleDebugInfo = useCallback((info: typeof debugInfo) => {
    setDebugInfo(info);
  }, []);

  // Hover handlers for debug panel activation (attached to hand button)
  const [debugHoverHandlers, setDebugHoverHandlers] = useState<{
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  } | null>(null);

  // Right offset for transcript panel
  const rightOffset = transcriptPanelOpen ? 'right-[412px] sm:right-[417px] xl:right-[492px] xl:sm:right-[497px]' : 'right-3 sm:right-5';
  const rightOffsetHelp = transcriptPanelOpen ? 'right-[414px] sm:right-[419px] xl:right-[494px] xl:sm:right-[499px]' : 'right-5 sm:right-7';
  
  const baseClasses = `fixed bottom-36 sm:bottom-5 ${rightOffset} z-50 flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 border shadow-sm hover:shadow-md active:scale-95`;
  const activeClasses = "bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500";
  const inactiveClasses = "bg-slate-900/80 backdrop-blur-md border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-600";

  return (
    <>
      {/* Info Button - centered above the stop button */}
      {isActive && (
        <button
          onClick={toggleTooltip}
          data-help-button
          className={`fixed bottom-[12.25rem] sm:bottom-[4.5rem] ${rightOffsetHelp} z-50 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 border shadow-sm hover:shadow-md active:scale-95 bg-slate-900/80 backdrop-blur-md border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-600`}
          title="Show gesture shortcuts"
        >
          <HelpCircle size={12} />
        </button>
      )}

      {/* Floating Tooltip - shown when info button is clicked */}
      {isActive && showTooltip && (
        <div
          data-tooltip
          className={`fixed bottom-52 sm:bottom-[72px] ${rightOffset} z-50 animate-in slide-in-from-bottom-2 fade-in duration-300`}
          style={{ maxWidth: '220px' }}
        >
          <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-xl p-3 relative">
            {/* Arrow pointing down */}
            <div className="absolute bottom-0 right-4 transform translate-y-full">
              <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-700/80" />
            </div>

            <div className="flex items-start gap-2 mb-2">
              <Hand size={14} className="text-blue-400 shrink-0 mt-0.5" />
              <span className="text-xs text-slate-300 font-medium">Gesture Shortcuts</span>
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
                <MousePointerClick size={10} className="text-pink-400" /> Point+2nd → Click
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <ThumbsUp size={10} className="text-green-400" /> Up → Yes
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <ThumbsDown size={10} className="text-orange-400" /> Down → No
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <MoveVertical size={10} className="text-purple-400" /> Fist → Scroll
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <Hand size={10} className="text-cyan-400" /> Hold Point → Click
              </div>
            </div>

            {skipIntro && (
              <button
                onClick={resetPreference}
                className="mt-2 w-full text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Show full guide on next start
              </button>
            )}
          </div>
        </div>
      )}

      {/* Visual feedback ring showing gesture progress */}
      {isActive && gestureState.progress > 0 && (
        <div
          className={`fixed bottom-36 sm:bottom-5 ${rightOffset} z-40 pointer-events-none`}
          style={{ width: '48px', height: '48px', marginRight: '-4px', marginBottom: '-4px' }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48" className="transform -rotate-90">
            {/* Background ring */}
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              stroke="rgba(100, 116, 139, 0.3)"
              strokeWidth="3"
            />
            {/* Progress ring */}
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              stroke={flashTrigger ? '#22c55e' : '#fbbf24'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${gestureState.progress * 132} 132`}
              style={{
                filter: flashTrigger
                  ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))'
                  : 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.5))',
                transition: 'stroke 0.2s, filter 0.2s'
              }}
            />
          </svg>
        </div>
      )}

      <button
        onClick={toggle}
        onMouseEnter={debugHoverHandlers?.onMouseEnter}
        onMouseLeave={debugHoverHandlers?.onMouseLeave}
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
                  icon={<MousePointerClick size={18} className="text-pink-400" />}
                  label="Point + 2nd Finger"
                  desc="Click (most reliable)"
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
                  icon={<Hand size={18} className="text-cyan-400" />}
                  label="Point & Hold"
                  desc="Click (hold 1.5s)"
                />
              </div>

              {/* Remember choice checkbox */}
              <label className="flex items-center gap-2 mb-4 cursor-pointer group">
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${rememberChoice
                    ? 'bg-blue-600 border-blue-500'
                    : 'border-slate-600 hover:border-slate-500 group-hover:bg-slate-800/50'
                    }`}
                  onClick={() => setRememberChoice(!rememberChoice)}
                >
                  {rememberChoice && <Check size={12} className="text-white" />}
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors select-none">
                  Don't show this guide again
                </span>
              </label>

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

      {isActive && !mouseSimulation && (
        <HandBackground 
          {...props} 
          onGestureState={handleGestureState} 
          onError={handleCameraError}
          config={gestureConfig}
          onDebugInfo={handleDebugInfo}
          onLandmarkData={setLandmarkData}
          onPerformance={setPerformanceMetrics}
        />
      )}

      {/* Debug Panel */}
      <GestureDebugPanel
        enabled={debugEnabled}
        onToggle={() => setDebugEnabled(!debugEnabled)}
        gestureState={gestureState}
        config={gestureConfig}
        onConfigChange={handleConfigChange}
        mouseSimulation={mouseSimulation}
        onMouseSimulationToggle={() => {
          setMouseSimulation(!mouseSimulation);
          if (!mouseSimulation) {
            // Turning on mouse simulation - activate gesture mode
            setIsActive(true);
          }
        }}
        transcriptPanelOpen={transcriptPanelOpen}
        onHoverHandlers={setDebugHoverHandlers}
        debugInfo={debugInfo}
        landmarkData={landmarkData}
        performance={performanceMetrics}
      />

      {/* Camera Error Toast */}
      {cameraError && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-red-900/90 backdrop-blur-md border border-red-500/50 text-red-100 px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 max-w-md">
            <Camera size={18} className="text-red-400 shrink-0" />
            <span className="text-sm">{cameraError}</span>
            <button
              onClick={() => setCameraError(null)}
              className="ml-2 text-red-300 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
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
