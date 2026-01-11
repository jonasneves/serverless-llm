import { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';

export type AppContext = 'chat' | 'compare' | 'analyze' | 'debate';

export interface GestureCallbacks {
  onStopGeneration?: () => void;
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  onModeChange?: (direction: 'prev' | 'next') => void;
}

export interface GestureState {
  gesture: string | null;
  progress: number;
  triggered: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  detectionTime: number;
}

interface GestureContextValue {
  isActive: boolean;
  setIsActive: (active: boolean) => void;
  appContext: AppContext;
  setAppContext: (context: AppContext) => void;
  callbacks: React.MutableRefObject<GestureCallbacks>;
  setCallbacks: (callbacks: GestureCallbacks) => void;
  gestureState: GestureState;
  setGestureState: (state: GestureState) => void;
  performanceMetrics: PerformanceMetrics | undefined;
  setPerformanceMetrics: (metrics: PerformanceMetrics | undefined) => void;
  cameraError: string | null;
  setCameraError: (error: string | null) => void;
}

const GestureContext = createContext<GestureContextValue | null>(null);

export function GestureProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [appContext, setAppContext] = useState<AppContext>('chat');
  const callbacksRef = useRef<GestureCallbacks>({});
  const setCallbacks = useCallback((cb: GestureCallbacks) => { callbacksRef.current = cb; }, []);
  const [gestureState, setGestureState] = useState<GestureState>({ gesture: null, progress: 0, triggered: false });
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | undefined>(undefined);
  const [cameraError, setCameraError] = useState<string | null>(null);

  return (
    <GestureContext.Provider value={{
      isActive, setIsActive,
      appContext, setAppContext,
      callbacks: callbacksRef, setCallbacks,
      gestureState, setGestureState,
      performanceMetrics, setPerformanceMetrics,
      cameraError, setCameraError,
    }}>
      {children}
    </GestureContext.Provider>
  );
}

export function useGesture() {
  const context = useContext(GestureContext);
  if (!context) throw new Error('useGesture must be used within GestureProvider');
  return context;
}

export function useGestureOptional() {
  return useContext(GestureContext);
}

export default GestureContext;
