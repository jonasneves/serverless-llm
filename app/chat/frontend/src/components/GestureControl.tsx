import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Hand, X, Camera, HelpCircle, Check, Navigation, Bug, BookOpen } from 'lucide-react';
import GestureDebugPanel, { GestureConfig } from './GestureDebugPanel';
import GestureTrainingModal from './GestureTrainingModal';
import { useGesture } from '../context/GestureContext';

const STORAGE_KEY = 'gesture-control-skip-intro';
const DEBUG_CONFIG_KEY = 'gesture-debug-config';

// Context for which mode the gestures should work with
export type AppContext = 'chat' | 'compare' | 'analyze' | 'debate';

interface GestureControlProps {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  onModeChange?: (direction: 'prev' | 'next') => void;
  /** When true, renders inline (for embedding in Header) instead of fixed position */
  inHeader?: boolean;
  /** Current app context to customize gesture behavior */
  appContext?: AppContext;
}

export default function GestureControl({ inHeader = false, ...props }: GestureControlProps) {
  // Use shared context for state that HandBackground needs
  const gesture = useGesture();

  // Sync context with props
  useEffect(() => {
    gesture.setCallbacks({
      onStopGeneration: props.onStopGeneration,
      onSendMessage: props.onSendMessage,
      onScroll: props.onScroll,
      onPinch: props.onPinch,
      onHover: props.onHover,
      onModeChange: props.onModeChange,
    });
  }, [props.onStopGeneration, props.onSendMessage, props.onScroll, props.onPinch, props.onHover, props.onModeChange, gesture.setCallbacks]);

  // Sync app context
  useEffect(() => {
    if (props.appContext) {
      gesture.setAppContext(props.appContext);
    }
  }, [props.appContext, gesture.setAppContext]);

  // Local UI state (not shared)
  const [showModal, setShowModal] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [flashTrigger, setFlashTrigger] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const panelFloatingRef = useRef<HTMLDivElement>(null);
  const [panelBounds, setPanelBounds] = useState<{ width: number; height: number }>({ width: 256, height: 320 });

  // Use context for state shared with HandBackground (rendered in Playground)
  const {
    isActive, setIsActive,
    gestureConfig, setGestureConfig,
    mouseSimulation, setMouseSimulation,
    gestureState, setGestureState,
    debugInfo,
    landmarkData,
    performanceMetrics,
    cameraError, setCameraError,
  } = gesture;

  // Debug panel state
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [showTrainingModal, setShowTrainingModal] = useState(false);

  // Load gesture config from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DEBUG_CONFIG_KEY);
      if (saved) {
        try {
          setGestureConfig(JSON.parse(saved));
        } catch { }
      }
    }
  }, [setGestureConfig]);

  // Load preference from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      setSkipIntro(true);
    }
  }, []);

  // Close panel on click outside
  useEffect(() => {
    if (!showPanel) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPanel(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPanel]);

  // Respond to gesture state changes from HandBackground (via context)
  useEffect(() => {
    if (gestureState.triggered) {
      setFlashTrigger(true);
      setTimeout(() => setFlashTrigger(false), 300);
    }
  }, [gestureState]);

  // Handle camera error - clear error after timeout
  useEffect(() => {
    if (cameraError) {
      setIsActive(false);
      const timer = setTimeout(() => setCameraError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [cameraError, setIsActive, setCameraError]);

  const toggleActive = () => {
    if (isActive) {
      setIsActive(false);
      setShowPanel(false);
    } else {
      if (skipIntro) {
        setIsActive(true);
      } else {
        setShowModal(true);
      }
    }
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
  };

  // Save gesture config to localStorage when changed
  const handleConfigChange = useCallback((newConfig: GestureConfig) => {
    setGestureConfig(newConfig);
    localStorage.setItem(DEBUG_CONFIG_KEY, JSON.stringify(newConfig));
  }, [setGestureConfig]);

  // Mouse simulation
  useEffect(() => {
    if (!mouseSimulation) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (props.onHover) {
        props.onHover(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
      }
      setGestureState({ gesture: 'POINTING', progress: 0, triggered: false });
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[data-debug-panel]') || target.closest('[data-gesture-panel]')) {
        return;
      }
      setGestureState({ gesture: 'TWO_FINGER_POINT', progress: 0.5, triggered: false });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[data-debug-panel]') || target.closest('[data-gesture-panel]')) {
        return;
      }
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

  // Position near the header menu ([≡]) in the center header track
  // Only used when NOT embedded in header (legacy mode)
  const handOffsetStyle = { left: 'calc(50% - 180px)' };

  // Get button position for floating elements when inHeader mode
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateRect = () => {
      if (buttonRef.current) {
        setButtonRect(buttonRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isActive, showPanel, inHeader]);

  // Measure dropdown panel size for collision avoidance
  useEffect(() => {
    if (!showPanel) return;
    const measure = () => {
      if (panelFloatingRef.current) {
        const rect = panelFloatingRef.current.getBoundingClientRect();
        setPanelBounds({ width: rect.width, height: rect.height });
      }
    };
    const id = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
    };
  }, [showPanel]);

  // Wrapper classes differ based on mode
  const containerClass = inHeader
    ? 'relative z-50 pointer-events-auto' // Inline in header
    : 'fixed top-4 sm:top-6 z-50 pointer-events-auto'; // Legacy fixed position

  const containerStyle = inHeader ? {} : handOffsetStyle;

  return (
    <>
      {/* Main Hand Control Button */}
      <div
        ref={panelRef}
        className={containerClass}
        style={containerStyle}
      >
        {/* Main button with status indicator */}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => {
              if (isActive) {
                // When active, clicking opens the panel instead of toggling off
                setShowPanel(!showPanel);
              } else {
                toggleActive();
              }
            }}
            className={`relative min-w-[42px] min-h-[42px] w-[42px] h-[42px] rounded-full flex items-center justify-center border transition-all duration-200 active:scale-95 ${isActive
              ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 hover:bg-blue-500/30 animate-pulse'
              : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              }`}
            title={isActive ? "Open Gesture Control Panel" : "Enable Gesture Control"}
          >
            <Hand size={18} />
          </button>

          {/* Close button positioned absolutely to prevent layout shift */}
          {isActive && (
            <button
              onClick={() => setIsActive(false)}
              className="absolute top-full mt-1 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all active:scale-95 pointer-events-auto"
              title="Disable Gesture Control"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Dropdown Panel - appears beside the button and clamps to viewport */}
        {isActive && showPanel && (
          <div
            ref={panelFloatingRef}
            data-gesture-panel
            className="fixed z-[100] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-200"
            style={(() => {
              const width = 256; // matches w-64
              const margin = 12;
              if (buttonRect) {
                const left = Math.min(buttonRect.right + margin, window.innerWidth - width - margin);
                const targetTop = buttonRect.top + buttonRect.height / 2 - 150; // center-ish
                const top = Math.max(margin, Math.min(targetTop, window.innerHeight - 320));
                return { left, top, width };
              }
              // Fallback to relative placement when rect unknown
              return { width, left: margin, top: 80 };
            })()}
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hand size={14} className="text-blue-400" />
                <span className="text-xs font-medium text-slate-200">Gesture Control</span>
              </div>
              {performanceMetrics && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {performanceMetrics.fps}fps
                </span>
              )}
            </div>

            {/* Gesture Hints */}
            <div className="px-3 py-2 border-b border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Gestures</div>
                <HelpCircle size={10} className="text-slate-600" />
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="flex items-center gap-1.5 text-slate-400 py-0.5">
                  ☝️ Point → Hover
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 py-0.5">
                  🖐️ Hold → Click
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 py-0.5">
                  ✊ Fist → Scroll
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 py-0.5">
                  👋 Wave → Hi
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 py-0.5">
                  👍 Up → Yes
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 py-0.5">
                  👎 Down → No
                </div>
              </div>
            </div>

            {/* Debug Toggle */}
            <div className="px-3 py-2 border-b border-slate-700/50">
              <button
                onClick={() => setDebugEnabled(!debugEnabled)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-all ${debugEnabled
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-slate-400 hover:bg-slate-800/50'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <Bug size={12} />
                  <span className="text-xs font-medium">Debug Panel</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${debugEnabled ? 'bg-amber-500/20' : 'bg-slate-700/50'
                  }`}>
                  {debugEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Training Toggle */}
            <div className="px-3 py-2 border-b border-slate-700/50">
              <button
                onClick={() => setShowTrainingModal(true)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-all"
              >
                <div className="flex items-center gap-2">
                  <BookOpen size={12} />
                  <span className="text-xs font-medium">Gesture Training</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50">
                  Learn
                </span>
              </button>
            </div>

            {/* Actions */}
            <div className="px-3 py-2 flex gap-2">
              <button
                onClick={() => {
                  resetPreference();
                  setShowModal(true);
                }}
                className="flex-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Show guide
              </button>
              <button
                onClick={toggleActive}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-all"
              >
                <X size={10} />
                Stop
              </button>
            </div>
          </div>
        )}
      </div>

      {/* HandBackground is now rendered at Playground level via GestureContext */}

      {/* Portal for fixed-position elements when rendered inside header */}
      {createPortal(
        <>
          {/* Visual feedback ring - near the main button */}
          {isActive && gestureState.progress > 0 && !showPanel && (
            <div
              className="fixed z-40 pointer-events-none"
              style={inHeader && buttonRect
                ? {
                  left: buttonRect.left + buttonRect.width / 2 - 24,
                  top: buttonRect.top + buttonRect.height / 2 - 24,
                  width: '48px',
                  height: '48px'
                }
                : {
                  ...handOffsetStyle,
                  top: 'calc(1rem)',
                  width: '48px',
                  height: '48px',
                  marginLeft: '-4px',
                  marginTop: '-4px'
                }
              }
            >
              <svg width="48" height="48" viewBox="0 0 48 48" className="transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="21"
                  fill="none"
                  stroke="rgba(100, 116, 139, 0.3)"
                  strokeWidth="3"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="21"
                  fill="none"
                  stroke={flashTrigger ? '#22c55e' : '#3b82f6'}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${gestureState.progress * 132} 132`}
                  style={{
                    filter: flashTrigger
                      ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))'
                      : 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))',
                    transition: 'stroke 0.2s, filter 0.2s'
                  }}
                />
              </svg>
            </div>
          )}

          {/* Intro Modal */}
          {showModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => setShowModal(false)}
              />

              <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm sm:max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] sm:max-h-[85vh]">
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-1.5 sm:p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
                      <Hand size={18} className="text-slate-300 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold text-slate-100">Gesture Control</h2>
                      <p className="text-[10px] sm:text-xs text-slate-500">Camera-based hand tracking</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="p-4 sm:p-5 overflow-y-auto flex-1">
                  <p className="text-xs sm:text-sm text-slate-400 mb-4 leading-relaxed">
                    Control the app using hand gestures. Use navigation gestures to interact:
                  </p>

                  {/* Navigation Mode Info */}
                  <div className="p-4 rounded-xl border-2 border-slate-700/50 bg-slate-800/30 mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                        <Navigation size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">Navigation Gestures</div>
                        <div className="text-[10px] text-slate-500">Point, click, scroll</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-500">
                      <div className="flex items-center gap-1">☝️ Hover</div>
                      <div className="flex items-center gap-1">✊ Scroll</div>
                      <div className="flex items-center gap-1">👍 Yes</div>
                      <div className="flex items-center gap-1">👎 No</div>
                    </div>
                  </div>

                  {/* Privacy note */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <Camera size={14} className="text-slate-500 mt-0.5 shrink-0" />
                    <p className="text-[10px] sm:text-xs text-slate-500 leading-relaxed">
                      All processing happens <span className="text-slate-400">locally in your browser</span>.
                      No video is sent to any server.
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-5 border-t border-slate-800 shrink-0 bg-slate-900/50">
                  {/* Remember choice checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer group mb-4">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${rememberChoice
                        ? 'bg-blue-600 border-blue-500'
                        : 'border-slate-600 hover:border-slate-500 group-hover:bg-slate-800/50'
                        }`}
                      onClick={() => setRememberChoice(!rememberChoice)}
                    >
                      {rememberChoice && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-[10px] sm:text-xs text-slate-400 group-hover:text-slate-300 transition-colors select-none">
                      Don't show this guide again
                    </span>
                  </label>

                  <button
                    onClick={startCamera}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
                  >
                    Enable Gesture Control
                  </button>
                </div>
              </div>
            </div>
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
                setIsActive(true);
              }
            }}
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
        </>,
        document.body
      )}

      {/* Gesture Training Modal */}
      <GestureTrainingModal
        open={showTrainingModal}
        onClose={() => setShowTrainingModal(false)}
      />
    </>
  );
}
