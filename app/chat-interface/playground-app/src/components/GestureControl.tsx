import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Hand, X, Camera, HelpCircle, Check, Type, Navigation, Bug } from 'lucide-react';
import HandBackground, { GestureMode } from './HandBackground';
import GestureDebugPanel, { GestureConfig, DEFAULT_GESTURE_CONFIG } from './GestureDebugPanel';

const STORAGE_KEY = 'gesture-control-skip-intro';
const DEBUG_CONFIG_KEY = 'gesture-debug-config';
const MODE_STORAGE_KEY = 'gesture-mode';

interface GestureControlProps {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  onModeChange?: (direction: 'prev' | 'next') => void;
  transcriptPanelOpen?: boolean;
  /** When true, renders inline (for embedding in Header) instead of fixed position */
  inHeader?: boolean;
}

// ASL recognition result type
interface ASLResult {
  letter: string | null;
  confidence: number;
  allGestures: Array<{ name: string; score: number }>;
}

export default function GestureControl({ transcriptPanelOpen = false, inHeader = false, ...props }: GestureControlProps) {
  const [isActive, setIsActive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [gestureState, setGestureState] = useState<{
    gesture: string | null;
    progress: number;
    triggered: boolean;
  }>({ gesture: null, progress: 0, triggered: false });
  const [flashTrigger, setFlashTrigger] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  // Gesture mode state
  const [gestureMode, setGestureMode] = useState<GestureMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === 'asl' || saved === 'navigation') {
        return saved as GestureMode;
      }
    }
    return 'navigation';
  });

  // ASL mode state
  const [aslResult, setASLResult] = useState<ASLResult | null>(null);
  const [aslBuffer, setASLBuffer] = useState<string>('');

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

  // Save gesture mode to localStorage when changed
  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, gestureMode);
  }, [gestureMode]);

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

  // Handle gesture state updates
  const handleGestureState = useCallback((state: { gesture: string | null; progress: number; triggered: boolean }) => {
    setGestureState(state);
    if (state.triggered) {
      setFlashTrigger(true);
      setTimeout(() => setFlashTrigger(false), 300);

      if (gestureMode === 'asl' && state.gesture) {
        // Handle control gestures (SEND, CLEAR, SPACE, BACKSPACE)
        if (state.gesture.startsWith('ACTION:')) {
          const action = state.gesture.replace('ACTION: ', '');
          switch (action) {
            case 'SEND':
              if (aslBuffer && props.onSendMessage) {
                props.onSendMessage(aslBuffer);
                setASLBuffer('');
              }
              break;
            case 'CLEAR':
              setASLBuffer('');
              break;
            case 'SPACE':
              setASLBuffer(prev => prev + ' ');
              break;
            case 'BACKSPACE':
              setASLBuffer(prev => prev.slice(0, -1));
              break;
          }
        }
        // Handle letter gestures
        else if (state.gesture.startsWith('ASL:')) {
          const letter = state.gesture.replace('ASL: ', '');
          setASLBuffer(prev => prev + letter);
        }
      }
    }
  }, [gestureMode, aslBuffer, props.onSendMessage]);

  // Handle ASL result updates
  const handleASLResult = useCallback((result: ASLResult) => {
    setASLResult(result);
  }, []);

  // Clear ASL buffer
  const clearASLBuffer = useCallback(() => {
    setASLBuffer('');
  }, []);

  // Send ASL buffer as message
  const sendASLBuffer = useCallback(() => {
    if (aslBuffer && props.onSendMessage) {
      props.onSendMessage(aslBuffer);
      setASLBuffer('');
    }
  }, [aslBuffer, props.onSendMessage]);

  // Handle camera errors
  const handleCameraError = (message: string) => {
    setCameraError(message);
    setIsActive(false);
    setTimeout(() => setCameraError(null), 5000);
  };

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
  }, []);

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

  // Handle debug info updates from HandBackground
  const handleDebugInfo = useCallback((info: typeof debugInfo) => {
    setDebugInfo(info);
  }, []);

  // Position near the header menu ([≡]) in the center header track
  // Only used when NOT embedded in header (legacy mode)
  const handOffsetStyle = transcriptPanelOpen
    ? { left: 'calc(50% - 190px)' }
    : { left: 'calc(50% - 180px)' };

  // Get button position for floating elements when inHeader mode
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!inHeader || !buttonRef.current) return;
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
  }, [inHeader, isActive, showPanel]);

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
        <div className="relative flex items-center gap-1">
          {/* Red X close button - appears when active, now on the LEFT */}
          {isActive && (
            <button
              onClick={() => setIsActive(false)}
              className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all active:scale-95"
              title="Disable Gesture Control"
            >
              <X size={12} />
            </button>
          )}

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
            className={`relative min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-200 active:scale-95 ${isActive
              ? gestureMode === 'asl'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-blue-500/20 border-blue-500/50 text-blue-400 hover:bg-blue-500/30'
              : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              }`}
            title={isActive ? "Open Gesture Control Panel" : "Enable Gesture Control"}
          >
            <Hand size={18} />

            {/* Active pulse indicator */}
            {isActive && (
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${gestureMode === 'asl' ? 'bg-emerald-400' : 'bg-blue-400'
                } animate-pulse`} />
            )}
          </button>
        </div>

        {/* Dropdown Panel - appears below the button, aligned to the right */}
        {isActive && showPanel && (
          <div
            data-gesture-panel
            className="absolute top-full right-0 mt-10 w-64 z-[100] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200"
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hand size={14} className={gestureMode === 'asl' ? 'text-emerald-400' : 'text-blue-400'} />
                <span className="text-xs font-medium text-slate-200">Gesture Control</span>
              </div>
              {performanceMetrics && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {performanceMetrics.fps}fps
                </span>
              )}
            </div>

            {/* Mode Toggle */}
            <div className="px-3 py-2 border-b border-slate-700/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Mode</div>
              <div className="flex gap-1">
                <button
                  onClick={() => setGestureMode('navigation')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${gestureMode === 'navigation'
                    ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                    : 'bg-slate-800/50 border border-transparent text-slate-400 hover:bg-slate-700/50'
                    }`}
                >
                  <Navigation size={12} />
                  Navigate
                </button>
                <button
                  onClick={() => setGestureMode('asl')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${gestureMode === 'asl'
                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                    : 'bg-slate-800/50 border border-transparent text-slate-400 hover:bg-slate-700/50'
                    }`}
                >
                  <Type size={12} />
                  ASL
                </button>
              </div>
            </div>

            {/* Gesture Hints */}
            <div className="px-3 py-2 border-b border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Gestures</div>
                <HelpCircle size={10} className="text-slate-600" />
              </div>

              {gestureMode === 'navigation' ? (
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
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="text-emerald-400">👍</span> Send
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="text-red-400">🖐️</span> Clear
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="text-blue-400 text-[8px]">✋→</span> Space
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="text-orange-400 text-[8px]">🤏</span> Backspace
                    </div>
                  </div>
                  <div className="grid grid-cols-9 gap-0.5">
                    {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
                      <span
                        key={letter}
                        className={`text-center py-0.5 rounded text-[8px] ${aslResult?.letter === letter
                          ? 'bg-emerald-500/30 text-emerald-400'
                          : 'bg-slate-800/50 text-slate-600'
                          }`}
                      >
                        {letter}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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

      {/* Portal for fixed-position elements when rendered inside header */}
      {createPortal(
        <>
          {/* ASL Buffer Display - floating to the LEFT of the hand gesture button when in ASL mode */}
          {isActive && gestureMode === 'asl' && (
            <div
              className="fixed z-50 pointer-events-auto"
              style={inHeader && buttonRect
                ? {
                  // Position to the LEFT of the close button + hand button, vertically centered
                  // Close button is w-6 (24px) + gap-1 (4px) = 28px extra offset
                  right: window.innerWidth - buttonRect.left + 40, // Account for close button + gap
                  top: buttonRect.top + (buttonRect.height / 2) - 30 // Vertically center approx
                }
                : { ...handOffsetStyle, top: 'calc(4rem)' }
              }
            >
              <div className="bg-slate-900/95 backdrop-blur-md border border-emerald-500/30 rounded-lg shadow-xl p-2 min-w-[180px]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Type size={10} className="text-emerald-400" />
                    <span className="text-[10px] text-slate-400">ASL Input</span>
                  </div>
                  {aslResult?.letter && (
                    <span className="text-sm font-bold text-emerald-400 animate-pulse">
                      {aslResult.letter}
                    </span>
                  )}
                </div>

                {/* Buffer */}
                <div className="bg-slate-800/50 rounded px-2 py-1.5 min-h-[28px] flex items-center justify-between">
                  <span className="font-mono text-slate-200 text-xs tracking-wider">
                    {aslBuffer || <span className="text-slate-600 italic text-[10px]">Sign letters...</span>}
                  </span>
                  {aslBuffer && (
                    <div className="flex gap-0.5 ml-2">
                      <button
                        onClick={clearASLBuffer}
                        className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                        title="Clear"
                      >
                        <X size={12} />
                      </button>
                      <button
                        onClick={sendASLBuffer}
                        className="text-slate-500 hover:text-emerald-400 transition-colors p-0.5"
                        title="Send"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Progress indicator */}
                {gestureState.progress > 0 && (
                  <div className="mt-1.5 h-1 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-100 ${gestureState.gesture?.startsWith('ACTION') ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                      style={{ width: `${gestureState.progress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

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
                  stroke={flashTrigger ? '#22c55e' : gestureMode === 'asl' ? '#10b981' : '#3b82f6'}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${gestureState.progress * 132} 132`}
                  style={{
                    filter: flashTrigger
                      ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))'
                      : `drop-shadow(0 0 6px ${gestureMode === 'asl' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(59, 130, 246, 0.5)'})`,
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
                    <div className="p-1.5 sm:p-2 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 rounded-lg">
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
                    Control the app using hand gestures. Choose a mode to get started:
                  </p>

                  {/* Mode Selection - clicking directly enables camera */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {/* Navigation Mode */}
                    <button
                      onClick={() => {
                        setGestureMode('navigation');
                        startCamera();
                      }}
                      className="group p-4 rounded-xl border-2 border-slate-700/50 bg-slate-800/30 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                          <Navigation size={20} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-200">Navigate</div>
                          <div className="text-[10px] text-slate-500">Point, click, scroll</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-500">
                        <div className="flex items-center gap-1">☝️ Hover</div>
                        <div className="flex items-center gap-1">✊ Scroll</div>
                        <div className="flex items-center gap-1">👍 Yes</div>
                        <div className="flex items-center gap-1">👎 No</div>
                      </div>
                    </button>

                    {/* ASL Mode */}
                    <button
                      onClick={() => {
                        setGestureMode('asl');
                        startCamera();
                      }}
                      className="group p-4 rounded-xl border-2 border-slate-700/50 bg-slate-800/30 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                          <Type size={20} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-200">ASL Alphabet</div>
                          <div className="text-[10px] text-slate-500">Fingerspelling A-Z</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-9 gap-0.5">
                        {'ABCDEFGHI'.split('').map(letter => (
                          <span
                            key={letter}
                            className="text-center py-0.5 rounded bg-slate-700/30 text-slate-500 text-[8px] font-mono"
                          >
                            {letter}
                          </span>
                        ))}
                      </div>
                    </button>
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
                  <label className="flex items-center gap-2 cursor-pointer group">
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
                </div>
              </div>
            </div>
          )}

          {isActive && !mouseSimulation && (
            <HandBackground
              {...props}
              onGestureState={handleGestureState}
              onASLResult={handleASLResult}
              onError={handleCameraError}
              config={gestureConfig}
              onDebugInfo={handleDebugInfo}
              onLandmarkData={setLandmarkData}
              onPerformance={setPerformanceMetrics}
              mode={gestureMode}
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
                setIsActive(true);
              }
            }}
            transcriptPanelOpen={transcriptPanelOpen}
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
    </>
  );
}

