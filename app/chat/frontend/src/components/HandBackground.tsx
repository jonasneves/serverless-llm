import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, GestureRecognizer, GestureRecognizerResult } from '@mediapipe/tasks-vision';

// Hardcoded config
const DWELL_TIME = 1200;
const CURSOR_SMOOTHING = 0.5;
const GESTURE_COOLDOWN = 1500;
const PERSISTENCE_THRESHOLD = 10;

interface HandBackgroundProps {
  onSendMessage?: (msg: string) => void;
  onScroll?: (deltaY: number) => void;
  onPinch?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  onGestureState?: (state: { gesture: string | null; progress: number; triggered: boolean }) => void;
  onError?: (message: string) => void;
  onPerformance?: (metrics: { fps: number; detectionTime: number }) => void;
  gestureActiveArea?: { minX: number; maxX: number; minY: number; maxY: number };
}

const GESTURE_MAP: Record<string, { action: string; message?: string }> = {
  'Thumb_Up': { action: 'message', message: '👍' },
  'Thumb_Down': { action: 'message', message: '👎' },
  'Open_Palm': { action: 'message', message: '👋' },
  'Victory': { action: 'message', message: 'ok' },
  'ILoveYou': { action: 'message', message: 'thanks' },
  'Closed_Fist': { action: 'message', message: 'stop' },
  'Pointing_Up': { action: 'point' },
};

export default function HandBackground({
  onSendMessage, onScroll, onPinch, onHover, onGestureState, onError, onPerformance, gestureActiveArea
}: HandBackgroundProps) {
  const onSendMessageRef = useRef(onSendMessage);
  const onScrollRef = useRef(onScroll);
  const onPinchRef = useRef(onPinch);
  const onHoverRef = useRef(onHover);
  const onGestureStateRef = useRef(onGestureState);
  const onPerformanceRef = useRef(onPerformance);
  const gestureActiveAreaRef = useRef(gestureActiveArea);
  const onErrorRef = useRef(onError);

  onSendMessageRef.current = onSendMessage;
  onScrollRef.current = onScroll;
  onPinchRef.current = onPinch;
  onHoverRef.current = onHover;
  onGestureStateRef.current = onGestureState;
  onPerformanceRef.current = onPerformance;
  gestureActiveAreaRef.current = gestureActiveArea;
  onErrorRef.current = onError;

  const fpsRef = useRef({ frames: 0, lastTime: performance.now(), fps: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const requestRef = useRef<number>();
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const smoothedCursorRef = useRef({ x: 0, y: 0 });
  const cursorVisibleRef = useRef(false);

  const lastGestureTime = useRef(0);
  const persistence = useRef({ candidate: 'NEUTRAL', frames: 0 });
  const handState = useRef({
    isScrolling: false, lastScrollY: null as number | null, scrollVelocity: 0,
    waveXPositions: [] as number[], waveDirectionChanges: 0, lastWaveDirection: null as 'left' | 'right' | null, waveStartTime: 0,
    dwellStartTime: 0, dwellPosition: null as { x: number; y: number } | null,
    middleFingerActive: false,
  });

  const isInActiveArea = useCallback((x: number, y: number) => {
    const area = gestureActiveAreaRef.current;
    if (!area) return true;
    const screenX = 1 - x;
    return screenX >= area.minX && screenX <= area.maxX && y >= area.minY && y <= area.maxY;
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
        const wasmPath = isExtension ? '/mediapipe' : 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';
        const modelPath = isExtension ? '/mediapipe/gesture_recognizer.task' : 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

        const vision = await FilesetResolver.forVisionTasks(wasmPath);
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
          runningMode: "VIDEO", numHands: 2,
          minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
        });
        gestureRecognizerRef.current = recognizer;
        setLoaded(true);
      } catch (error) {
        console.error("Error initializing gesture recognition:", error);
      }
    };
    init();
    return () => { gestureRecognizerRef.current?.close(); };
  }, []);

  const processGestures = useCallback((result: GestureRecognizerResult, now: number) => {
    const state = handState.current;
    const p = persistence.current;

    if (!result.gestures?.length) {
      state.isScrolling = false;
      state.lastScrollY = null;
      if (cursorVisibleRef.current && cursorRef.current) {
        cursorRef.current.style.opacity = '0';
        cursorVisibleRef.current = false;
      }
      if (state.middleFingerActive && onGestureStateRef.current) {
        onGestureStateRef.current({ gesture: null, progress: 0, triggered: false });
        state.middleFingerActive = false;
      }
      return null;
    }

    const gesture = result.gestures[0]?.[0];
    const landmarks = result.landmarks[0];
    if (!gesture || !landmarks) return null;

    const name = gesture.categoryName;
    const config = GESTURE_MAP[name];

    // Pointing
    if (name === 'Pointing_Up') {
      const tip = landmarks[8];
      const pos = { x: 1 - tip.x, y: tip.y };
      onHoverRef.current?.(pos.x, pos.y);

      const w = window.innerWidth, h = window.innerHeight;
      const targetX = pos.x * w, targetY = pos.y * h;
      const s = smoothedCursorRef.current;
      if (!cursorVisibleRef.current) { s.x = targetX; s.y = targetY; }
      else { s.x += (targetX - s.x) * CURSOR_SMOOTHING; s.y += (targetY - s.y) * CURSOR_SMOOTHING; }

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${s.x}px, ${s.y}px)`;
        cursorRef.current.style.opacity = '1';
      }
      cursorVisibleRef.current = true;

      // Dwell click
      if (!state.dwellPosition) { state.dwellStartTime = now; state.dwellPosition = pos; }
      else {
        const dist = Math.sqrt((pos.x - state.dwellPosition.x) ** 2 + (pos.y - state.dwellPosition.y) ** 2);
        if (dist > 0.05) { state.dwellStartTime = now; state.dwellPosition = pos; }
        else {
          const dur = now - state.dwellStartTime;
          if (dur >= DWELL_TIME && onPinchRef.current) {
            onPinchRef.current(pos.x, pos.y);
            lastGestureTime.current = now;
            state.dwellStartTime = 0; state.dwellPosition = null;
            onGestureStateRef.current?.({ gesture: 'DWELL_CLICK', progress: 1, triggered: true });
            return 'DWELL_CLICK';
          }
          onGestureStateRef.current?.({ gesture: 'POINTING', progress: Math.min(1, dur / DWELL_TIME), triggered: false });
        }
      }
      return 'POINTING';
    } else {
      state.dwellStartTime = 0; state.dwellPosition = null;
      if (cursorVisibleRef.current && cursorRef.current) { cursorRef.current.style.opacity = '0'; cursorVisibleRef.current = false; }
    }

    // Scroll with fist
    if (name === 'Closed_Fist') {
      const y = landmarks[0].y;
      if (!state.isScrolling) { state.isScrolling = true; state.lastScrollY = y; state.scrollVelocity = 0; }
      else if (state.lastScrollY !== null) {
        const delta = y - state.lastScrollY;
        const vel = (state.scrollVelocity || 0) * 0.6 + delta * 0.4;
        state.scrollVelocity = vel;
        if (Math.abs(vel) > 0.006 && onScrollRef.current) { onScrollRef.current(vel * 1800); state.lastScrollY = y; }
        else if (Math.abs(delta) > 0.02) { state.lastScrollY = y; }
      }
      return 'FIST';
    } else { state.isScrolling = false; state.lastScrollY = null; state.scrollVelocity = 0; }

    // Wave
    if (name === 'Open_Palm') {
      const x = landmarks[0].x;
      if (!state.waveStartTime || now - state.waveStartTime > 2000) {
        state.waveXPositions = [x]; state.waveDirectionChanges = 0; state.lastWaveDirection = null; state.waveStartTime = now;
      } else {
        const last = state.waveXPositions[state.waveXPositions.length - 1];
        const dx = x - last;
        if (Math.abs(dx) > 0.03) {
          state.waveXPositions.push(x);
          const dir = dx > 0 ? 'right' : 'left';
          if (state.lastWaveDirection && dir !== state.lastWaveDirection) state.waveDirectionChanges++;
          state.lastWaveDirection = dir;
          if (state.waveDirectionChanges >= 3 && now - lastGestureTime.current > GESTURE_COOLDOWN) {
            const el = document.activeElement;
            const inputFocused = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
            if (onSendMessageRef.current && !inputFocused && isInActiveArea(x, landmarks[0].y)) {
              onSendMessageRef.current("Hi");
              lastGestureTime.current = now;
              state.waveDirectionChanges = 0; state.waveStartTime = 0; state.lastWaveDirection = null; state.waveXPositions = [];
              return 'WAVE';
            }
          }
        }
      }
    }

    // Middle finger easter egg
    const wrist = landmarks[0], indexTip = landmarks[8], middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20], middlePip = landmarks[10];
    const d = (a: any, b: any) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const mExt = d(middleTip, wrist), iExt = d(indexTip, wrist), rExt = d(ringTip, wrist), pExt = d(pinkyTip, wrist);
    const straight = d(middleTip, wrist) > d(middlePip, wrist);
    if (straight && mExt > iExt * 2 && mExt > rExt * 2 && mExt > pExt * 2) {
      if (p.candidate === 'Middle_Finger') p.frames++; else { p.candidate = 'Middle_Finger'; p.frames = 1; }
      const prog = Math.min(1, p.frames / 8);
      state.middleFingerActive = p.frames >= 8;
      onGestureStateRef.current?.({ gesture: 'Middle_Finger', progress: prog, triggered: state.middleFingerActive });
      if (state.middleFingerActive) return 'Middle_Finger';
    } else if (state.middleFingerActive || p.candidate === 'Middle_Finger') {
      state.middleFingerActive = false; p.candidate = 'NEUTRAL'; p.frames = 0;
      onGestureStateRef.current?.({ gesture: null, progress: 0, triggered: false });
    }

    // Other gestures
    if (config?.action === 'message' && config.message) {
      if (p.candidate === name) p.frames++; else { p.candidate = name; p.frames = 1; }
      if (p.frames >= PERSISTENCE_THRESHOLD && now - lastGestureTime.current > GESTURE_COOLDOWN) {
        const el = document.activeElement;
        const inputFocused = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
        if (onSendMessageRef.current && !inputFocused && isInActiveArea(landmarks[0].x, landmarks[0].y)) {
          onSendMessageRef.current(config.message);
          lastGestureTime.current = now; p.frames = 0;
          onGestureStateRef.current?.({ gesture: name, progress: 1, triggered: true });
          return name;
        }
      }
      onGestureStateRef.current?.({ gesture: name, progress: Math.min(1, p.frames / PERSISTENCE_THRESHOLD), triggered: false });
    }

    return name;
  }, [isInActiveArea]);

  const draw = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !gestureRecognizerRef.current || !video.videoWidth) {
      requestRef.current = requestAnimationFrame(draw);
      return;
    }

    const w = window.innerWidth, h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

    const ctx = canvas.getContext('2d');
    if (!ctx) { requestRef.current = requestAnimationFrame(draw); return; }

    const now = performance.now();
    const result = gestureRecognizerRef.current.recognizeForVideo(video, now);
    const gesture = processGestures(result, now);

    // FPS
    fpsRef.current.frames++;
    const elapsed = now - fpsRef.current.lastTime;
    if (elapsed >= 1000) {
      fpsRef.current.fps = Math.round(fpsRef.current.frames * 1000 / elapsed);
      fpsRef.current.frames = 0; fpsRef.current.lastTime = now;
      onPerformanceRef.current?.({ fps: fpsRef.current.fps, detectionTime: Math.round(performance.now() - now) });
    }

    ctx.clearRect(0, 0, w, h);

    if (result.landmarks?.length) {
      for (const hand of result.landmarks) {
        let color = '#3b82f6', glow = '#60a5fa';
        if (gesture === 'POINTING') { color = '#06b6d4'; glow = '#67e8f9'; }
        else if (gesture === 'Thumb_Up') { color = '#22c55e'; glow = '#86efac'; }
        else if (gesture === 'Thumb_Down') { color = '#f97316'; glow = '#fdba74'; }
        else if (gesture === 'FIST' || gesture === 'Closed_Fist') { color = '#a855f7'; glow = '#d8b4fe'; }
        else if (gesture === 'WAVE' || gesture === 'Open_Palm') { color = '#f59e0b'; glow = '#fcd34d'; }
        else if (gesture === 'Middle_Finger') { color = '#ef4444'; glow = '#f87171'; }

        // Connections
        const conns = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
        ctx.shadowColor = color; ctx.shadowBlur = 8;
        for (const [s, e] of conns) {
          ctx.beginPath();
          ctx.moveTo(hand[s].x * w, hand[s].y * h);
          ctx.lineTo(hand[e].x * w, hand[e].y * h);
          ctx.strokeStyle = color; ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Dots
        for (let i = 0; i < hand.length; i++) {
          const pt = hand[i], x = pt.x * w, y = pt.y * h;
          const tip = [4,8,12,16,20].includes(i);
          ctx.beginPath(); ctx.arc(x, y, tip ? 4 : 2, 0, Math.PI * 2);
          ctx.fillStyle = tip ? '#fff' : '#1e293b';
          ctx.shadowColor = glow; ctx.shadowBlur = tip ? 15 : 5;
          ctx.fill();
          if (!tip) { ctx.strokeStyle = glow; ctx.lineWidth = 1; ctx.stroke(); }
        }
        ctx.shadowBlur = 0;
      }
    } else if (cursorVisibleRef.current && cursorRef.current) {
      cursorRef.current.style.opacity = '0';
      cursorVisibleRef.current = false;
    }

    requestRef.current = requestAnimationFrame(draw);
  }, [processGestures]);

  useEffect(() => {
    if (!loaded || !videoRef.current) return;
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          videoRef.current.addEventListener('loadeddata', () => {
            if (canvasRef.current) { canvasRef.current.width = window.innerWidth; canvasRef.current.height = window.innerHeight; }
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            requestRef.current = requestAnimationFrame(draw);
          });
        }
      })
      .catch(err => {
        let msg = "Could not access camera";
        if (err.name === 'NotFoundError') msg = "No camera found.";
        else if (err.name === 'NotAllowedError') msg = "Camera access denied.";
        else if (err.name === 'NotReadableError') msg = "Camera in use.";
        onErrorRef.current?.(msg);
      });
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [loaded, draw]);

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      gestureRecognizerRef.current?.close();
    };
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden scale-x-[-1]">
        <video ref={videoRef} className="hidden" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-50 mix-blend-screen" />
      </div>
      <div
        ref={cursorRef}
        className="fixed pointer-events-none z-[9999]"
        style={{ top: 0, left: 0, width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: '50%', border: '2px solid rgba(148, 163, 184, 0.7)', opacity: 0, boxShadow: '0 0 8px rgba(148, 163, 184, 0.3)', willChange: 'transform, opacity' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/90" />
      </div>
    </>
  );
}
