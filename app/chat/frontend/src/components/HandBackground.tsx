import { useEffect, useRef, useState, useCallback } from 'react';
import {
    FilesetResolver,
    GestureRecognizer,
    GestureRecognizerResult
} from '@mediapipe/tasks-vision';

interface GestureConfig {
    twoFingerTapWindow: number;
    twoFingerTapCooldown: number;
    twoFingerMinFrames: number;
    minPointingTime: number;
    dwellTime: number;
    cursorSmoothing: number;
}

interface DebugInfo {
    indexExtended: boolean;
    middleExtended: boolean;
    ringExtended: boolean;
    pinkyExtended: boolean;
    wasPointingOnly: boolean;
    twoFingerFrames: number;
    clickLocked: boolean;
}

interface LandmarkData {
    landmarks: Array<{ x: number; y: number; z: number }> | null;
    handedness: 'Left' | 'Right' | null;
}

interface PerformanceMetrics {
    fps: number;
    detectionTime: number;
}

interface HandBackgroundProps {
    onStopGeneration?: () => void;
    onSendMessage?: (msg: string) => void;
    onScroll?: (deltaY: number) => void;
    onPinch?: (x: number, y: number) => void;
    onHover?: (x: number, y: number) => void;
    onModeChange?: (direction: 'prev' | 'next') => void;
    onGestureState?: (state: {
        gesture: string | null;
        progress: number;
        triggered: boolean;
    }) => void;
    onError?: (message: string) => void;
    config?: GestureConfig;
    onDebugInfo?: (info: DebugInfo) => void;
    onLandmarkData?: (data: LandmarkData) => void;
    onPerformance?: (metrics: PerformanceMetrics) => void;
    appContext?: 'chat' | 'compare' | 'analyze' | 'debate';
    // Restrict message gestures (thumbs up/down, etc.) to only work within this area
    // Values are normalized 0-1 representing screen position
    gestureActiveArea?: { minX: number; maxX: number; minY: number; maxY: number };
}

// Cursor position state for the floating pointer indicator
interface CursorState {
    visible: boolean;
    x: number;
    y: number;
    isClicking: boolean;
}

// Default config values
const DEFAULT_CONFIG: GestureConfig = {
    twoFingerTapWindow: 500,
    twoFingerTapCooldown: 400,
    twoFingerMinFrames: 4,
    minPointingTime: 100,
    dwellTime: 1200,
    cursorSmoothing: 0.5,
};

// MediaPipe GestureRecognizer built-in gestures
const NAVIGATION_GESTURE_MAP: Record<string, { action: string; message?: string; direction?: 'prev' | 'next' }> = {
    'Thumb_Up': { action: 'message', message: '👍' },
    'Thumb_Down': { action: 'message', message: '👎' },
    'Open_Palm': { action: 'message', message: '👋' },
    'Victory': { action: 'message', message: 'ok' },
    'ILoveYou': { action: 'message', message: 'thanks' },
    'Closed_Fist': { action: 'message', message: 'stop' },
    'Pointing_Up': { action: 'point' },
};

export default function HandBackground({
    onStopGeneration,
    onSendMessage,
    onScroll,
    onPinch,
    onHover,
    onModeChange,
    onGestureState,
    onError,
    config = DEFAULT_CONFIG,
    onDebugInfo,
    onLandmarkData,
    onPerformance,
    appContext = 'chat',
    gestureActiveArea
}: HandBackgroundProps) {
    // Refs for callbacks
    const onStopGenerationRef = useRef(onStopGeneration);
    const onSendMessageRef = useRef(onSendMessage);
    const onScrollRef = useRef(onScroll);
    const onPinchRef = useRef(onPinch);
    const onHoverRef = useRef(onHover);
    const onModeChangeRef = useRef(onModeChange);
    const onGestureStateRef = useRef(onGestureState);
    const onDebugInfoRef = useRef(onDebugInfo);
    const onLandmarkDataRef = useRef(onLandmarkData);
    const onPerformanceRef = useRef(onPerformance);
    const configRef = useRef(config);
    const appContextRef = useRef(appContext);
    const gestureActiveAreaRef = useRef(gestureActiveArea);

    // Update refs on every render
    onStopGenerationRef.current = onStopGeneration;
    onSendMessageRef.current = onSendMessage;
    onScrollRef.current = onScroll;
    onPinchRef.current = onPinch;
    onHoverRef.current = onHover;
    onModeChangeRef.current = onModeChange;
    onGestureStateRef.current = onGestureState;
    onDebugInfoRef.current = onDebugInfo;
    onLandmarkDataRef.current = onLandmarkData;
    onPerformanceRef.current = onPerformance;
    configRef.current = config;
    appContextRef.current = appContext;
    gestureActiveAreaRef.current = gestureActiveArea;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    // Performance tracking
    const fpsRef = useRef({ frames: 0, lastTime: performance.now(), fps: 0 });

    const videoRef = useRef<HTMLVideoElement>(null);
    const downscaleCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dotsCanvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);
    const requestRef = useRef<number>();

    // MediaPipe refs
    const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Floating cursor refs
    const cursorRef = useRef<HTMLDivElement>(null);
    const cursorInnerRef = useRef<HTMLDivElement>(null);
    const cursorStateRef = useRef<CursorState>({ visible: false, x: 0, y: 0, isClicking: false });
    const smoothedCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

// Gesture state
const lastGestureTime = useRef<number>(0);
const gestureCooldown = 1500;
const PERSISTENCE_THRESHOLD = 15;
const MIDDLE_FINGER_PERSISTENCE = 8;
const gesturePersistence = useRef<Map<number, { candidate: string; frames: number }>>(new Map());

// Navigation mode state (for scroll, pointing)
const handStates = useRef<Map<number, {
    isScrolling: boolean;
        lastScrollY: number | null;
        scrollVelocity: number;
        lastOpenTime: number;
        waveXPositions: number[];
        waveDirectionChanges: number;
        lastWaveDirection: 'left' | 'right' | null;
        waveStartTime: number;
        dwellStartTime: number;
        dwellPosition: { x: number; y: number } | null;
        wasPointingOnly: boolean;
        pointingOnlyStartTime: number;
        twoFingerFrames: number;
        clickLocked: boolean;
        middleFingerActive: boolean;
    }>>(new Map());

    // Adaptive persistence thresholds based on gesture complexity
    const getAdaptivePersistenceThreshold = useCallback((gestureName: string) => {
        // Complex gestures need more persistence (higher threshold)
        const complexGestures = ['Victory', 'ILoveYou', 'Fist', 'Open_Palm'];
        const simpleGestures = ['Thumb_Up', 'Thumb_Down', 'Pointing_Up'];

        if (complexGestures.includes(gestureName)) {
            return 15; // Higher threshold for complex gestures
        } else if (simpleGestures.includes(gestureName)) {
            return 5;  // Lower threshold for simple gestures
        }
        return PERSISTENCE_THRESHOLD; // Default threshold
    }, []);


    // Function to determine if a gesture should be processed based on app context
    const shouldProcessGesture = useCallback((gestureName: string, context: string) => {
        // Mode change gestures should work in all contexts
        if (['PREV_MODE', 'NEXT_MODE'].includes(gestureName)) {
            return true;
        }

        switch (context) {
            case 'chat':
                // In chat mode, allow all navigation gestures
                return true;
            case 'compare':
                // In compare mode, focus on navigation gestures
                return true;
            case 'analyze':
            case 'debate':
                // In discussion modes, allow navigation and key control gestures
                return true;
            default:
                return true; // Default behavior
        }
    }, []);

    // Function to check if hand position is within the active gesture area
    const isInActiveArea = useCallback((handX: number, handY: number) => {
        const area = gestureActiveAreaRef.current;
        if (!area) return true; // No restriction, allow everywhere

        // handX and handY are normalized 0-1, but handX from camera is mirrored
        // so we use (1 - handX) to get actual screen position
        const screenX = 1 - handX;

        return screenX >= area.minX && screenX <= area.maxX &&
            handY >= area.minY && handY <= area.maxY;
    }, []);

    const getHandState = useCallback((index: number) => {
        if (!handStates.current.has(index)) {
            handStates.current.set(index, {
                isScrolling: false,
                lastScrollY: null,
                scrollVelocity: 0,
                lastOpenTime: 0,
                waveXPositions: [],
                waveDirectionChanges: 0,
                lastWaveDirection: null,
                waveStartTime: 0,
                dwellStartTime: 0,
                dwellPosition: null,
                wasPointingOnly: false,
                pointingOnlyStartTime: 0,
                twoFingerFrames: 0,
                clickLocked: false,
                middleFingerActive: false
            });
        }
        return handStates.current.get(index)!;
    }, []);

    const getPersistence = useCallback((index: number) => {
        if (!gesturePersistence.current.has(index)) {
            gesturePersistence.current.set(index, { candidate: 'NEUTRAL', frames: 0 });
        }
        return gesturePersistence.current.get(index)!;
    }, []);

    // Initialize MediaPipe
    useEffect(() => {
        let gestureRecognizer: GestureRecognizer | null = null;

        const init = async () => {
            try {
                // Detect extension context - use local files to avoid CSP issues
                const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

                const wasmPath = isExtension
                    ? '/mediapipe'  // Local files in extension
                    : 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';

                const gestureModelPath = isExtension
                    ? '/mediapipe/gesture_recognizer.task'
                    : 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

                const vision = await FilesetResolver.forVisionTasks(wasmPath);

                // Initialize GestureRecognizer for navigation mode (Google's pre-trained model)
                gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: gestureModelPath,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 2,
                    minHandDetectionConfidence: 0.5,
                    minHandPresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                gestureRecognizerRef.current = gestureRecognizer;

                // Create downscale canvas for performance (320x240)
                const downscaleCanvas = document.createElement('canvas');
                downscaleCanvas.width = 320;
                downscaleCanvas.height = 240;
                downscaleCanvasRef.current = downscaleCanvas;

                // Warm-up processing: run a 1x1 pixel canvas through the models
                const warmupCanvas = document.createElement('canvas');
                warmupCanvas.width = 1;
                warmupCanvas.height = 1;
                const warmupCtx = warmupCanvas.getContext('2d');
                if (warmupCtx) {
                    warmupCtx.fillStyle = '#000';
                    warmupCtx.fillRect(0, 0, 1, 1);
                }

                // Warm up the model
                try {
                    if (gestureRecognizer) {
                        gestureRecognizer.recognizeForVideo(warmupCanvas, 0);
                    }
                } catch (e) {
                    // Warm-up errors are expected and can be ignored
                }

                setLoaded(true);
            } catch (error) {
                console.error("Error initializing gesture recognition:", error);
            }
        };

        init();

        return () => {
            if (gestureRecognizerRef.current) {
                gestureRecognizerRef.current.close();
            }
        };
    }, []);

    // Process navigation gestures using MediaPipe GestureRecognizer
    const processNavigationGestures = useCallback((
        result: GestureRecognizerResult,
        now: number,
        handIndex: number
    ) => {
        const state = getHandState(handIndex);
        const persistence = getPersistence(handIndex);
        const currentContext = appContextRef.current;

        if (!result.gestures || result.gestures.length === 0) {
            // No gestures detected
            state.isScrolling = false;
            state.lastScrollY = null;
            if (cursorStateRef.current.visible && cursorRef.current) {
                cursorRef.current.style.opacity = '0';
                cursorStateRef.current.visible = false;
            }
            if (state.middleFingerActive && onGestureStateRef.current) {
                onGestureStateRef.current({ gesture: null, progress: 0, triggered: false });
                state.middleFingerActive = false;
            }
            return null;
        }

        const gesture = result.gestures[handIndex]?.[0];
        const landmarks = result.landmarks[handIndex];

        if (!gesture || !landmarks) return null;

        const gestureName = gesture.categoryName;

        // Check if this gesture should be processed in the current context
        if (!shouldProcessGesture(gestureName, currentContext)) {
            return null;
        }

        const gestureConfig = NAVIGATION_GESTURE_MAP[gestureName];

        // Handle pointing and clicking
        if (gestureName === 'Pointing_Up' && landmarks) {
            const indexTip = landmarks[8];
            const currentPos = { x: 1 - indexTip.x, y: indexTip.y };

            // Emit hover
            if (onHoverRef.current) {
                onHoverRef.current(currentPos.x, currentPos.y);
            }

            // Update cursor
            const width = window.innerWidth;
            const height = window.innerHeight;
            const targetX = currentPos.x * width;
            const targetY = currentPos.y * height;

            const SMOOTHING = configRef.current.cursorSmoothing;
            const smoothed = smoothedCursorRef.current;
            if (!cursorStateRef.current.visible) {
                smoothed.x = targetX;
                smoothed.y = targetY;
            } else {
                smoothed.x += (targetX - smoothed.x) * SMOOTHING;
                smoothed.y += (targetY - smoothed.y) * SMOOTHING;
            }

            if (cursorRef.current) {
                cursorRef.current.style.transform = `translate(${smoothed.x}px, ${smoothed.y}px)`;
                cursorRef.current.style.opacity = '1';
                cursorRef.current.style.borderColor = 'rgba(148, 163, 184, 0.7)';
                cursorRef.current.style.boxShadow = '0 0 8px rgba(148, 163, 184, 0.3)';
            }
            cursorStateRef.current = { visible: true, x: smoothed.x, y: smoothed.y, isClicking: false };

            // Dwell click
            const DWELL_TIME = configRef.current.dwellTime;
            const DWELL_MOVE_THRESHOLD = 0.05;

            if (state.dwellPosition === null) {
                state.dwellStartTime = now;
                state.dwellPosition = currentPos;
            } else {
                const moveDistance = Math.sqrt(
                    Math.pow(currentPos.x - state.dwellPosition.x, 2) +
                    Math.pow(currentPos.y - state.dwellPosition.y, 2)
                );

                if (moveDistance > DWELL_MOVE_THRESHOLD) {
                    state.dwellStartTime = now;
                    state.dwellPosition = currentPos;
                } else {
                    const dwellDuration = now - state.dwellStartTime;
                    if (dwellDuration >= DWELL_TIME && onPinchRef.current) {
                        onPinchRef.current(currentPos.x, currentPos.y);
                        lastGestureTime.current = now;
                        state.dwellStartTime = 0;
                        state.dwellPosition = null;
                        if (onGestureStateRef.current) {
                            onGestureStateRef.current({ gesture: 'DWELL_CLICK', progress: 1, triggered: true });
                        }
                        return 'DWELL_CLICK';
                    }

                    if (onGestureStateRef.current) {
                        const progress = Math.min(1, dwellDuration / DWELL_TIME);
                        onGestureStateRef.current({ gesture: 'POINTING', progress, triggered: false });
                    }
                }
            }
            return 'POINTING';
        } else {
            state.dwellStartTime = 0;
            state.dwellPosition = null;
            if (cursorStateRef.current.visible && cursorRef.current) {
                cursorRef.current.style.opacity = '0';
                cursorStateRef.current.visible = false;
            }
        }

        // Handle scroll with Closed_Fist
        if (gestureName === 'Closed_Fist' && landmarks) {
            const wrist = landmarks[0];
            const currentY = wrist.y;

            if (!state.isScrolling) {
                state.isScrolling = true;
                state.lastScrollY = currentY;
                state.scrollVelocity = 0;
            } else if (state.lastScrollY !== null) {
                const rawDelta = currentY - state.lastScrollY;

                // Accumulate velocity with smoothing to reduce jitter
                const velocity = (state.scrollVelocity || 0) * 0.6 + rawDelta * 0.4;
                state.scrollVelocity = velocity;

                // Only trigger scroll if velocity is significant and consistent direction
                if (Math.abs(velocity) > 0.006 && onScrollRef.current) {
                    onScrollRef.current(velocity * 1800);
                    state.lastScrollY = currentY; // Only update reference when scrolling
                } else if (Math.abs(rawDelta) > 0.02) {
                    // Large jump - reset reference to prevent accumulation
                    state.lastScrollY = currentY;
                }
            }
            return 'FIST';
        } else {
            state.isScrolling = false;
            state.lastScrollY = null;
            state.scrollVelocity = 0;
        }

        // Handle wave detection for Open_Palm
        if (gestureName === 'Open_Palm' && landmarks) {
            state.lastOpenTime = now;
            const wrist = landmarks[0];
            const currentX = wrist.x;

            if (state.waveStartTime === 0 || (now - state.waveStartTime) > 2000) {
                state.waveXPositions = [currentX];
                state.waveDirectionChanges = 0;
                state.lastWaveDirection = null;
                state.waveStartTime = now;
            } else {
                const lastX = state.waveXPositions[state.waveXPositions.length - 1];
                const deltaX = currentX - lastX;
                const moveThreshold = 0.03;

                if (Math.abs(deltaX) > moveThreshold) {
                    state.waveXPositions.push(currentX);
                    const newDirection = deltaX > 0 ? 'right' : 'left';

                    if (state.lastWaveDirection && newDirection !== state.lastWaveDirection) {
                        state.waveDirectionChanges++;
                    }
                    state.lastWaveDirection = newDirection;

                    if (state.waveDirectionChanges >= 3 && (now - lastGestureTime.current > gestureCooldown)) {
                        // Don't send if input is focused
                        const activeElement = document.activeElement;
                        const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

                        // Check if hand is in active gesture area (transcript panel)
                        const wristY = landmarks[0].y;
                        if (onSendMessageRef.current && !isInputFocused && isInActiveArea(currentX, wristY)) {
                            onSendMessageRef.current("Hi");
                            lastGestureTime.current = now;
                            state.waveDirectionChanges = 0;
                            state.waveStartTime = 0;
                            state.lastWaveDirection = null;
                            state.waveXPositions = [];
                            return 'WAVE';
                        }
                    }
                }
            }
        }

        // Middle Finger Easter Egg Detection
        // Check if middle finger is extended while others are curled
        if (landmarks) {
            const wrist = landmarks[0];
            const indexTip = landmarks[8];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            const middlePip = landmarks[10];

            // Simple distance check (relative to wrist)
            const d = (p1: any, p2: any) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

            // Thresholds: Middle tip should be far, others close
            const middleExt = d(middleTip, wrist);
            const indexExt = d(indexTip, wrist);
            const ringExt = d(ringTip, wrist);
            const pinkyExt = d(pinkyTip, wrist);
            const middleStraight = d(middleTip, wrist) > d(middlePip, wrist);

            // Middle should be significantly more extended than others
            if (middleStraight &&
                middleExt > indexExt * 2.0 &&
                middleExt > ringExt * 2.0 &&
                middleExt > pinkyExt * 2.0) {

                if (persistence.candidate === 'Middle_Finger') {
                    persistence.frames++;
                } else {
                    persistence.candidate = 'Middle_Finger';
                    persistence.frames = 1;
                }

                const progress = Math.min(1, persistence.frames / MIDDLE_FINGER_PERSISTENCE);
                const isActive = persistence.frames >= MIDDLE_FINGER_PERSISTENCE;

                state.middleFingerActive = isActive;

                if (onGestureStateRef.current) {
                    onGestureStateRef.current({
                        gesture: 'Middle_Finger',
                        progress,
                        triggered: isActive
                    });
                }

                if (isActive) {
                    return 'Middle_Finger';
                }
            } else if (state.middleFingerActive || persistence.candidate === 'Middle_Finger') {
                state.middleFingerActive = false;
                persistence.candidate = 'NEUTRAL';
                persistence.frames = 0;
                if (onGestureStateRef.current) {
                    onGestureStateRef.current({ gesture: null, progress: 0, triggered: false });
                }
            }
        }

        // Handle other gestures with persistence
        if (gestureConfig?.action === 'message' && gestureConfig.message) {
            if (persistence.candidate === gestureName) {
                persistence.frames++;
            } else {
                persistence.candidate = gestureName;
                persistence.frames = 1;
            }

            const adaptiveThreshold = getAdaptivePersistenceThreshold(gestureName);
            if (persistence.frames >= adaptiveThreshold &&
                (now - lastGestureTime.current > gestureCooldown)) {
                // Don't send if input is focused
                const activeElement = document.activeElement;
                const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

                // Check if hand is in active gesture area (transcript panel)
                const wrist = landmarks[0];
                if (onSendMessageRef.current && !isInputFocused && isInActiveArea(wrist.x, wrist.y)) {
                    onSendMessageRef.current(gestureConfig.message);
                    lastGestureTime.current = now;
                    persistence.frames = 0;
                    if (onGestureStateRef.current) {
                        onGestureStateRef.current({ gesture: gestureName, progress: 1, triggered: true });
                    }
                    return gestureName;
                }
            }

            if (onGestureStateRef.current) {
                const progress = Math.min(1, persistence.frames / adaptiveThreshold);
                onGestureStateRef.current({ gesture: gestureName, progress, triggered: false });
            }
        }


        return gestureName;
    }, [getHandState, getPersistence, shouldProcessGesture, getAdaptivePersistenceThreshold, isInActiveArea]);

    const draw = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) {
            requestRef.current = requestAnimationFrame(draw);
            return;
        }

        // Check we have the recognizer
        if (!gestureRecognizerRef.current) {
            requestRef.current = requestAnimationFrame(draw);
            return;
        }

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            requestRef.current = requestAnimationFrame(draw);
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            requestRef.current = requestAnimationFrame(draw);
            return;
        }

        const now = performance.now();
        const startTimeMs = now;

        // Downscale video for faster processing
        const downscaleCanvas = downscaleCanvasRef.current;
        if (downscaleCanvas) {
            const downscaleCtx = downscaleCanvas.getContext('2d');
            if (downscaleCtx) {
                downscaleCtx.drawImage(video, 0, 0, downscaleCanvas.width, downscaleCanvas.height);
            }
        }

        // Use downscaled canvas for detection, fallback to video if downscale not available
        const detectionSource = downscaleCanvas || video;

        let landmarks: Array<Array<{ x: number; y: number; z: number }>> = [];
        let gesture: string | null = null;

        // Use GestureRecognizer for navigation
        const result = gestureRecognizerRef.current.recognizeForVideo(detectionSource, startTimeMs);

        if (result.landmarks) {
            landmarks = result.landmarks.map(hand =>
                hand.map(l => ({ x: l.x, y: l.y, z: l.z }))
            );
        }

        // Process gestures for each hand
        for (let i = 0; i < (result.landmarks?.length || 0); i++) {
            const processedGesture = processNavigationGestures(result, startTimeMs, i);
            if (processedGesture) {
                gesture = processedGesture;
            }
        }

        // Emit landmark data for debug
        if (onLandmarkDataRef.current && landmarks[0]) {
            const handedness = result.handednesses?.[0]?.[0]?.categoryName as 'Left' | 'Right' | undefined;
            onLandmarkDataRef.current({
                landmarks: landmarks[0],
                handedness: handedness ?? null
            });
        }

        const detectionTime = Math.round(performance.now() - startTimeMs);

        // Track FPS
        fpsRef.current.frames++;
        const elapsed = startTimeMs - fpsRef.current.lastTime;
        if (elapsed >= 1000) {
            fpsRef.current.fps = Math.round(fpsRef.current.frames * 1000 / elapsed);
            fpsRef.current.frames = 0;
            fpsRef.current.lastTime = startTimeMs;
            if (onPerformanceRef.current) {
                onPerformanceRef.current({ fps: fpsRef.current.fps, detectionTime });
            }
        }

        // Get the dots canvas context
        const dotsCanvas = dotsCanvasRef.current;
        const dotsCtx = dotsCanvas?.getContext('2d');

        // Clear main canvas (for connections)
        ctx.clearRect(0, 0, width, height);

        // Clear dots canvas if it exists
        if (dotsCtx) {
            dotsCtx.clearRect(0, 0, width, height);
        }

        // Draw hands
        if (landmarks.length > 0) {
            for (const hand of landmarks) {
                // Dynamic color based on gesture with enhanced feedback
                let mainColor = '#3b82f6'; // Blue for navigation
                let glowColor = '#60a5fa';

                // Enhanced color coding based on gesture recognition state
                if (gesture) {
                    if (gesture === 'Pointing_Up' || gesture === 'POINTING') {
                        mainColor = '#06b6d4'; // Cyan for pointing
                        glowColor = '#67e8f9';
                    } else if (gesture === 'Thumb_Up' || gesture === 'THUMBS_UP') {
                        mainColor = '#22c55e'; // Green for positive
                        glowColor = '#86efac';
                    } else if (gesture === 'Thumb_Down' || gesture === 'THUMBS_DOWN') {
                        mainColor = '#f97316'; // Orange for negative
                        glowColor = '#fdba74';
                    } else if (gesture === 'Closed_Fist' || gesture === 'FIST') {
                        mainColor = '#a855f7'; // Purple for scroll
                        glowColor = '#d8b4fe';
                    } else if (gesture === 'Open_Palm' || gesture === 'WAVE') {
                        mainColor = '#f59e0b'; // Amber for wave
                        glowColor = '#fcd34d';
                    } else if (gesture === 'Middle_Finger') {
                        mainColor = '#ef4444'; // Red
                        glowColor = '#f87171';
                    } else {
                        mainColor = '#3b82f6'; // Default blue
                        glowColor = '#60a5fa';
                    }
                }

                // Draw connections on main canvas (background layer)
                const connections = [
                    [0, 1], [1, 2], [2, 3], [3, 4], // thumb
                    [0, 5], [5, 6], [6, 7], [7, 8], // index
                    [0, 9], [9, 10], [10, 11], [11, 12], // middle
                    [0, 13], [13, 14], [14, 15], [15, 16], // ring
                    [0, 17], [17, 18], [18, 19], [19, 20], // pinky
                    [5, 9], [9, 13], [13, 17] // palm
                ];

                for (const [start, end] of connections) {
                    const startPoint = hand[start];
                    const endPoint = hand[end];

                    const gradient = ctx.createLinearGradient(
                        startPoint.x * width, startPoint.y * height,
                        endPoint.x * width, endPoint.y * height
                    );
                    gradient.addColorStop(0, mainColor);
                    gradient.addColorStop(1, glowColor);

                    ctx.beginPath();
                    ctx.moveTo(startPoint.x * width, startPoint.y * height);
                    ctx.lineTo(endPoint.x * width, endPoint.y * height);
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = gesture ? 3 : 2; // Thicker lines when gesture detected
                    ctx.shadowColor = mainColor;
                    ctx.shadowBlur = gesture ? 10 : 8; // Enhanced glow when gesture detected
                    ctx.stroke();
                }

                // Draw landmarks on dots canvas (foreground layer)
                if (dotsCtx) {
                    for (let j = 0; j < hand.length; j++) {
                        const point = hand[j];
                        const x = point.x * width;
                        const y = point.y * height;

                        const isFingertip = [4, 8, 12, 16, 20].includes(j);
                        const radius = isFingertip ? (gesture ? 5 : 4) : (gesture ? 3 : 2); // Bigger when gesture detected

                        dotsCtx.beginPath();
                        dotsCtx.arc(x, y, radius, 0, 2 * Math.PI);

                        if (isFingertip) {
                            dotsCtx.fillStyle = '#ffffff';
                            dotsCtx.shadowColor = glowColor;
                            dotsCtx.shadowBlur = gesture ? 20 : 15; // Enhanced shadow when gesture detected
                        } else {
                            dotsCtx.fillStyle = '#1e293b';
                            dotsCtx.strokeStyle = glowColor;
                            dotsCtx.lineWidth = 1.5;
                            dotsCtx.shadowColor = mainColor;
                            dotsCtx.shadowBlur = gesture ? 8 : 5; // Enhanced shadow when gesture detected
                        }

                        dotsCtx.fill();
                        if (!isFingertip) dotsCtx.stroke();
                    }

                    dotsCtx.shadowBlur = 0;
                }
            }
        } else {
            // No hands detected
            if (cursorStateRef.current.visible && cursorRef.current) {
                cursorRef.current.style.opacity = '0';
                cursorStateRef.current.visible = false;
            }
            if (onLandmarkDataRef.current) {
                onLandmarkDataRef.current({ landmarks: null, handedness: null });
            }
        }

        requestRef.current = requestAnimationFrame(draw);
    }, [processNavigationGestures]);

    // Start camera when loaded
    useEffect(() => {
        if (loaded && videoRef.current) {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.play();
                        videoRef.current.addEventListener('loadeddata', () => {
                            // Ensure canvases are properly sized when video loads
                            const width = window.innerWidth;
                            const height = window.innerHeight;

                            if (canvasRef.current) {
                                canvasRef.current.width = width;
                                canvasRef.current.height = height;
                            }

                            if (dotsCanvasRef.current) {
                                dotsCanvasRef.current.width = width;
                                dotsCanvasRef.current.height = height;
                            }

                            if (requestRef.current) cancelAnimationFrame(requestRef.current);
                            requestRef.current = requestAnimationFrame(draw);
                        });
                    }
                }).catch(err => {
                    console.error("Error accessing webcam:", err);
                    let message = "Could not access camera";
                    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                        message = "No camera found. Please connect a webcam to use gesture control.";
                    } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        message = "Camera access denied. Please allow camera access in your browser settings.";
                    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                        message = "Camera is in use by another application.";
                    }
                    if (onErrorRef.current) {
                        onErrorRef.current(message);
                    }
                });
            } else {
                console.warn("navigator.mediaDevices is undefined. Camera access requires HTTPS or localhost.");
            }
        }

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
    }, [loaded, draw]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = undefined;
            }

            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                    track.stop();
                });
                streamRef.current = null;
            }

            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }

            if (gestureRecognizerRef.current) {
                gestureRecognizerRef.current.close();
                gestureRecognizerRef.current = null;
            }

            // Clean up canvas references
            if (dotsCanvasRef.current) {
                dotsCanvasRef.current.width = 0;
                dotsCanvasRef.current.height = 0;
            }
        };
    }, []);

    /**
     * HandBackground is now rendered directly at Playground level (not via portal).
     * This gives correct stacking context automatically:
     * - Hand layer renders before other UI elements in the DOM
     * - Z-index values work correctly relative to siblings
     *
     * STACKING ORDER:
     * - Hand skeleton/dots: z-index 1 (behind UI, glass effect)
     * - UI elements: z-index 10+ (cards, chat, header, etc.)
     * - Cursor: z-index 9999 (always on top for click/hover)
     */

    return (
        <>
            {/*
             * Hand Skeleton Visualization Layer
             * ==================================
             * Rendered directly (no portal) at z-index:1 inside Playground container.
             * The opacity-50 and mix-blend-screen create the glass-like effect when behind UI.
             */}
            <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden scale-x-[-1]">
                <video ref={videoRef} className="hidden" playsInline muted autoPlay />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-50 mix-blend-screen" />
            </div>

            {/* Dots visualization (all landmarks) - also behind UI */}
            <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden scale-x-[-1]">
                <canvas ref={dotsCanvasRef} className="absolute inset-0 w-full h-full opacity-50 mix-blend-screen" />
            </div>

            {/* Floating cursor - ON TOP for click/hover */}
            <div
                ref={cursorRef}
                className="fixed pointer-events-none z-[9999]"
                style={{
                    top: 0,
                    left: 0,
                    width: 28,
                    height: 28,
                    marginLeft: -14,
                    marginTop: -14,
                    borderRadius: '50%',
                    border: '2px solid rgba(148, 163, 184, 0.7)',
                    opacity: 0,
                    boxShadow: '0 0 8px rgba(148, 163, 184, 0.3)',
                    willChange: 'transform, opacity',
                }}
            >
                <div
                    ref={cursorInnerRef}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                        width: 6,
                        height: 6,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    }}
                />
            </div>
        </>
    )
}
