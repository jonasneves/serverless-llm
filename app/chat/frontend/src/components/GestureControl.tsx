import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Hand, X, Camera, HelpCircle, Check, Navigation } from 'lucide-react';
import { useGesture } from '../context/GestureContext';

const STORAGE_KEY = 'gesture-control-skip-intro';

export type AppContext = 'chat' | 'compare' | 'analyze' | 'debate';

interface GestureControlProps {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  onModeChange?: (direction: 'prev' | 'next') => void;
  inHeader?: boolean;
  appContext?: AppContext;
}

export default function GestureControl({ inHeader = false, ...props }: GestureControlProps) {
  const gesture = useGesture();

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

  useEffect(() => {
    if (props.appContext) gesture.setAppContext(props.appContext);
  }, [props.appContext, gesture.setAppContext]);

  const [showModal, setShowModal] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [flashTrigger, setFlashTrigger] = useState(false);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { isActive, setIsActive, gestureState, cameraError, setCameraError, performanceMetrics } = gesture;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') setSkipIntro(true);
  }, []);

  useEffect(() => {
    if (!showPanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowPanel(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPanel(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPanel]);

  useEffect(() => {
    if (gestureState.triggered) {
      setFlashTrigger(true);
      setTimeout(() => setFlashTrigger(false), 300);
    }
  }, [gestureState]);

  useEffect(() => {
    if (cameraError) {
      setIsActive(false);
      const timer = setTimeout(() => setCameraError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [cameraError, setIsActive, setCameraError]);

  useEffect(() => {
    const updateRect = () => {
      if (buttonRef.current) setButtonRect(buttonRef.current.getBoundingClientRect());
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isActive, showPanel, inHeader]);

  const toggleActive = () => {
    if (isActive) {
      setIsActive(false);
      setShowPanel(false);
    } else if (skipIntro) {
      setIsActive(true);
    } else {
      setShowModal(true);
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

  const handOffsetStyle = { left: 'calc(50% - 180px)' };
  const containerClass = inHeader ? 'relative z-50 pointer-events-auto' : 'fixed top-4 sm:top-6 z-50 pointer-events-auto';
  const containerStyle = inHeader ? {} : handOffsetStyle;

  return (
    <>
      <div ref={panelRef} className={containerClass} style={containerStyle}>
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => isActive ? setShowPanel(!showPanel) : toggleActive()}
            className={`relative w-[42px] h-[42px] rounded-full flex items-center justify-center border transition-all duration-200 active:scale-95 ${
              isActive
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 hover:bg-blue-500/30 animate-pulse'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
            }`}
            title={isActive ? "Gesture Control Panel" : "Enable Gesture Control"}
          >
            <Hand size={18} />
          </button>

          {isActive && (
            <button
              onClick={() => setIsActive(false)}
              className="absolute top-full mt-1 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all active:scale-95"
              title="Disable"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {isActive && showPanel && (
          <div
            data-gesture-panel
            className="fixed z-[100] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-200"
            style={{
              width: 220,
              left: buttonRect ? Math.min(buttonRect.right + 12, window.innerWidth - 232) : 12,
              top: buttonRect ? Math.max(12, Math.min(buttonRect.top - 30, window.innerHeight - 200)) : 80,
            }}
          >
            <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hand size={14} className="text-blue-400" />
                <span className="text-xs font-medium text-slate-200">Gestures</span>
              </div>
              {performanceMetrics && (
                <span className="text-[10px] text-slate-500 font-mono">{performanceMetrics.fps}fps</span>
              )}
            </div>

            <div className="px-3 py-2 border-b border-slate-700/50">
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="text-slate-400">☝️ Point → Hover</div>
                <div className="text-slate-400">🖐️ Hold → Click</div>
                <div className="text-slate-400">✊ Fist → Scroll</div>
                <div className="text-slate-400">👋 Wave → Hi</div>
                <div className="text-slate-400">👍 Up → Yes</div>
                <div className="text-slate-400">👎 Down → No</div>
              </div>
            </div>

            <div className="px-3 py-2 flex gap-2">
              <button
                onClick={() => { localStorage.removeItem(STORAGE_KEY); setSkipIntro(false); setShowModal(true); }}
                className="flex-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Guide
              </button>
              <button
                onClick={toggleActive}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-all"
              >
                <X size={10} /> Stop
              </button>
            </div>
          </div>
        )}
      </div>

      {createPortal(
        <>
          {isActive && gestureState.progress > 0 && !showPanel && (
            <div
              className="fixed z-40 pointer-events-none"
              style={inHeader && buttonRect
                ? { left: buttonRect.left + buttonRect.width / 2 - 24, top: buttonRect.top + buttonRect.height / 2 - 24, width: 48, height: 48 }
                : { ...handOffsetStyle, top: 'calc(1rem)', width: 48, height: 48, marginLeft: -4, marginTop: -4 }
              }
            >
              <svg width="48" height="48" viewBox="0 0 48 48" className="transform -rotate-90">
                <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(100, 116, 139, 0.3)" strokeWidth="3" />
                <circle
                  cx="24" cy="24" r="21" fill="none"
                  stroke={flashTrigger ? '#22c55e' : '#3b82f6'}
                  strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${gestureState.progress * 132} 132`}
                  style={{ filter: flashTrigger ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))' : 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))', transition: 'stroke 0.2s, filter 0.2s' }}
                />
              </svg>
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowModal(false)} />
              <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
                      <Hand size={16} className="text-slate-300" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-100">Gesture Control</h2>
                      <p className="text-[10px] text-slate-500">Hand tracking</p>
                    </div>
                  </div>
                  <button onClick={() => setShowModal(false)} className="p-1 rounded text-slate-500 hover:text-slate-300">
                    <X size={16} />
                  </button>
                </div>

                <div className="p-4">
                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/30 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Navigation size={16} className="text-blue-400" />
                      <span className="text-xs font-medium text-slate-200">Navigation</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                      <div>☝️ Hover</div><div>✊ Scroll</div>
                      <div>👍 Yes</div><div>👎 No</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded bg-slate-800/30 border border-slate-700/30">
                    <Camera size={12} className="text-slate-500 mt-0.5" />
                    <p className="text-[9px] text-slate-500">Processing happens locally. No video sent to servers.</p>
                  </div>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                  <label className="flex items-center gap-2 cursor-pointer group mb-3">
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${rememberChoice ? 'bg-blue-600 border-blue-500' : 'border-slate-600'}`}
                      onClick={() => setRememberChoice(!rememberChoice)}
                    >
                      {rememberChoice && <Check size={10} className="text-white" />}
                    </div>
                    <span className="text-[10px] text-slate-400">Don't show again</span>
                  </label>
                  <button onClick={startCamera} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                    Enable
                  </button>
                </div>
              </div>
            </div>
          )}

          {cameraError && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
              <div className="bg-red-900/90 backdrop-blur-md border border-red-500/50 text-red-100 px-3 py-2 rounded-lg shadow-xl flex items-center gap-2 max-w-sm">
                <Camera size={14} className="text-red-400" />
                <span className="text-xs">{cameraError}</span>
                <button onClick={() => setCameraError(null)} className="ml-1 text-red-300 hover:text-white">
                  <X size={14} />
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
