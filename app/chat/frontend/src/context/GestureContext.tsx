import { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';

/**
 * GestureContext - Shared state for gesture control system
 * 
 * This context enables HandBackground to be rendered at the Playground level
 * (for correct z-index stacking) while GestureControl in the Header manages the UI.
 * 
 * Architecture:
 * - GestureProvider wraps the app at Playground level
 * - GestureControl (in Header) manages UI and updates context
 * - HandBackground (in Playground) reads from context and renders visuals
 */

// Re-export types from HandBackground for convenience
export type GestureMode = 'navigation' | 'asl';
export type AppContext = 'chat' | 'compare' | 'analyze' | 'debate';

export interface GestureConfig {
  twoFingerTapWindow: number;
  twoFingerTapCooldown: number;
  twoFingerMinFrames: number;
  minPointingTime: number;
  dwellTime: number;
  cursorSmoothing: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  twoFingerTapWindow: 500,
  twoFingerTapCooldown: 400,
  twoFingerMinFrames: 4,
  minPointingTime: 100,
  dwellTime: 1200,
  cursorSmoothing: 0.5,
};

// Callbacks that HandBackground needs (from GestureControl -> HandBackground)
export interface GestureCallbacks {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  onModeChange?: (direction: 'prev' | 'next') => void;
}

// Feedback state from HandBackground -> GestureControl
export interface GestureState {
  gesture: string | null;
  progress: number;
  triggered: boolean;
}

export interface ASLResult {
  letter: string | null;
  confidence: number;
  allGestures: Array<{ name: string; score: number }>;
}

export interface DebugInfo {
  indexExtended: boolean;
  middleExtended: boolean;
  ringExtended: boolean;
  pinkyExtended: boolean;
  wasPointingOnly: boolean;
  twoFingerFrames: number;
  clickLocked: boolean;
}

export interface LandmarkData {
  landmarks: Array<{ x: number; y: number; z: number }> | null;
  handedness: 'Left' | 'Right' | null;
}

export interface PerformanceMetrics {
  fps: number;
  detectionTime: number;
}

// Context value - shared state between GestureControl and HandBackground
interface GestureContextValue {
  // Is gesture control active (camera running)?
  isActive: boolean;
  setIsActive: (active: boolean) => void;
  
  // Current mode (navigation vs ASL)
  gestureMode: GestureMode;
  setGestureMode: (mode: GestureMode) => void;
  
  // App context (chat, compare, etc.)
  appContext: AppContext;
  setAppContext: (context: AppContext) => void;
  
  // Gesture config
  gestureConfig: GestureConfig;
  setGestureConfig: (config: GestureConfig) => void;
  
  // Mouse simulation mode (debug)
  mouseSimulation: boolean;
  setMouseSimulation: (enabled: boolean) => void;
  
  // Callbacks for gesture actions - stored in ref to avoid re-renders
  callbacks: React.MutableRefObject<GestureCallbacks>;
  setCallbacks: (callbacks: GestureCallbacks) => void;
  
  // Feedback state from HandBackground (for GestureControl UI)
  gestureState: GestureState;
  setGestureState: (state: GestureState) => void;
  aslResult: ASLResult | null;
  setASLResult: (result: ASLResult | null) => void;
  debugInfo: DebugInfo | undefined;
  setDebugInfo: (info: DebugInfo | undefined) => void;
  landmarkData: LandmarkData | undefined;
  setLandmarkData: (data: LandmarkData | undefined) => void;
  performanceMetrics: PerformanceMetrics | undefined;
  setPerformanceMetrics: (metrics: PerformanceMetrics | undefined) => void;
  cameraError: string | null;
  setCameraError: (error: string | null) => void;
}

const GestureContext = createContext<GestureContextValue | null>(null);

interface GestureProviderProps {
  children: ReactNode;
}

export function GestureProvider({ children }: GestureProviderProps) {
  const [isActive, setIsActive] = useState(false);
  const [gestureMode, setGestureMode] = useState<GestureMode>('navigation');
  const [appContext, setAppContext] = useState<AppContext>('chat');
  const [gestureConfig, setGestureConfig] = useState<GestureConfig>(DEFAULT_GESTURE_CONFIG);
  const [mouseSimulation, setMouseSimulation] = useState(false);
  
  // Use ref for callbacks to avoid re-renders when they change
  const callbacksRef = useRef<GestureCallbacks>({});
  
  const setCallbacks = useCallback((newCallbacks: GestureCallbacks) => {
    callbacksRef.current = newCallbacks;
  }, []);
  
  // Feedback state from HandBackground
  const [gestureState, setGestureState] = useState<GestureState>({ gesture: null, progress: 0, triggered: false });
  const [aslResult, setASLResult] = useState<ASLResult | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | undefined>(undefined);
  const [landmarkData, setLandmarkData] = useState<LandmarkData | undefined>(undefined);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | undefined>(undefined);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const value: GestureContextValue = {
    isActive,
    setIsActive,
    gestureMode,
    setGestureMode,
    appContext,
    setAppContext,
    gestureConfig,
    setGestureConfig,
    mouseSimulation,
    setMouseSimulation,
    callbacks: callbacksRef,
    setCallbacks,
    gestureState,
    setGestureState,
    aslResult,
    setASLResult,
    debugInfo,
    setDebugInfo,
    landmarkData,
    setLandmarkData,
    performanceMetrics,
    setPerformanceMetrics,
    cameraError,
    setCameraError,
  };
  
  return (
    <GestureContext.Provider value={value}>
      {children}
    </GestureContext.Provider>
  );
}

export function useGesture() {
  const context = useContext(GestureContext);
  if (!context) {
    throw new Error('useGesture must be used within a GestureProvider');
  }
  return context;
}

// Optional hook that returns null if not in provider (for conditional usage)
export function useGestureOptional() {
  return useContext(GestureContext);
}

export default GestureContext;
