import { useEffect, useRef, useState } from 'react';
import {
    FilesetResolver,
    HandLandmarker
} from '@mediapipe/tasks-vision';

interface HandBackgroundProps {
    onStopGeneration?: () => void;
    onSendMessage?: (msg: string) => void;
    onScroll?: (deltaY: number) => void;
    onPinch?: (x: number, y: number) => void;
}

export default function HandBackground({
    onStopGeneration,
    onSendMessage,
    onScroll,
    onPinch
}: HandBackgroundProps) {
    // Refs for callbacks to avoid stale closures in RAF loop
    const onStopGenerationRef = useRef(onStopGeneration);
    const onSendMessageRef = useRef(onSendMessage);
    const onScrollRef = useRef(onScroll);
    const onPinchRef = useRef(onPinch);

    // Update refs on every render
    onStopGenerationRef.current = onStopGeneration;
    onSendMessageRef.current = onSendMessage;
    onScrollRef.current = onScroll;
    onPinchRef.current = onPinch;

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);
    const requestRef = useRef<number>();
    const handLandmarkerRef = useRef<HandLandmarker | null>(null);
    const streamRef = useRef<MediaStream | null>(null); // Store stream for cleanup

    // Gesture State
    const lastGestureTime = useRef<number>(0);
    const gestureCooldown = 1500; // ms between discrete gestures like Yes/No
    const pinchCooldown = 500; // debounce pinch clicks

    // Persistence for static gestures (Stop, Yes, No) to prevent accidental triggers
    // Require ~15 frames (approx 0.5s at 30fps) of consistent detection
    const PERSISTENCE_THRESHOLD = 15;
    const gesturePersistence = useRef<Map<number, { candidate: string, frames: number }>>(new Map());

    // Track state per hand to prevent conflicts
    // Key: hand index (0 or 1)
    const handStates = useRef<Map<number, {
        isScrolling: boolean;
        lastScrollY: number | null;
        lastSwipeX: number | null;
        lastIndexTipY: number | null;
        lastOpenTime: number;
        // Wave detection: track x positions and direction changes
        waveXPositions: number[];
        waveDirectionChanges: number;
        lastWaveDirection: 'left' | 'right' | null;
        waveStartTime: number;
    }>>(new Map());

    const getHandState = (index: number) => {
        if (!handStates.current.has(index)) {
            handStates.current.set(index, {
                isScrolling: false,
                lastScrollY: null,
                lastSwipeX: null,
                lastIndexTipY: null,
                lastOpenTime: 0,
                waveXPositions: [],
                waveDirectionChanges: 0,
                lastWaveDirection: null,
                waveStartTime: 0
            });
        }
        return handStates.current.get(index)!;
    };

    const getPersistence = (index: number) => {
        if (!gesturePersistence.current.has(index)) {
            gesturePersistence.current.set(index, { candidate: 'NEUTRAL', frames: 0 });
        }
        return gesturePersistence.current.get(index)!;
    };

    useEffect(() => {
        let landmarker: HandLandmarker | null = null;

        const init = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );

                landmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 2 // Allow two hands
                });
                handLandmarkerRef.current = landmarker;
                setLoaded(true);
            } catch (error) {
                console.error("Error initializing HandLandmarker:", error);
            }
        };

        init();

        return () => {
            if (handLandmarkerRef.current) {
                handLandmarkerRef.current.close();
            }
        };
    }, []);

    const detectGesture = (landmarks: any[], now: number, handIndex: number) => {
        const state = getHandState(handIndex);
        const persistence = getPersistence(handIndex);

        // Basic finger states
        // Note: Coordinates are normalized [0,1]. Y increases downwards.
        // 0: Wrist, 4: ThumbTip
        // 8: IndexTip, 6: IndexPIP ...

        const indexTip = landmarks[8];
        const indexPip = landmarks[6];
        const middleTip = landmarks[12];
        const middlePip = landmarks[10];
        const ringTip = landmarks[16];
        const ringPip = landmarks[14];
        const pinkyTip = landmarks[20];
        const pinkyPip = landmarks[18];
        const thumbTip = landmarks[4];
        const thumbIp = landmarks[3];
        const wrist = landmarks[0];

        const indexExt = indexTip.y < indexPip.y;
        const middleExt = middleTip.y < middlePip.y;
        const ringExt = ringTip.y < ringPip.y;
        const pinkyExt = pinkyTip.y < pinkyPip.y;

        const fingersExtendedCount = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

        // -----------------------
        // 0. PINCH (Click/Select) - Immediate, Debounced
        // -----------------------
        const pinchDistance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2)
        );

        if (pinchDistance < 0.05) {
            if (now - lastGestureTime.current > pinchCooldown) {
                if (onPinchRef.current) {
                    const midX = (thumbTip.x + indexTip.x) / 2;
                    const midY = (thumbTip.y + indexTip.y) / 2;
                    onPinchRef.current(1 - midX, midY); // Mirror X
                    lastGestureTime.current = now;
                    return 'PINCH';
                }
            }
        }

        // -----------------------
        // 0.5 INDEX TAP (Pointing triggers Click)
        // -----------------------
        const isPointing = indexExt && !middleExt && !ringExt && !pinkyExt;

        if (isPointing) {
            const currentY = indexTip.y;
            if (state.lastIndexTipY !== null) {
                const dy = currentY - state.lastIndexTipY; // Positive = Down
                // Threshold for tap (velocity). 
                // Lowered to 0.015 to be more responsive.
                if (dy > 0.015 && (now - lastGestureTime.current > pinchCooldown)) {
                    if (onPinchRef.current) {
                        // Use start Y to target
                        onPinchRef.current(1 - indexTip.x, state.lastIndexTipY);
                        lastGestureTime.current = now;
                        return 'TAP';
                    }
                }
            }
            state.lastIndexTipY = currentY;
            // Return POINTING to visualize the cursor if no tap was detected
            return 'POINTING';
        } else {
            state.lastIndexTipY = null;
        }

        // -----------------------
        // 2. POSE IDENTIFICATION (Candidate Selection)
        // -----------------------
        let currentPose = 'NEUTRAL';

        // Check STOP (Open Palm) - Also tracks wave gesture
        if (fingersExtendedCount >= 4) {
            currentPose = 'STOP';
            state.lastOpenTime = now;

            // Wave detection: track horizontal movement while palm is open
            const currentX = wrist.x;

            // Start wave tracking if not already started
            if (state.waveStartTime === 0 || (now - state.waveStartTime) > 2000) {
                // Reset wave tracking after 2 seconds
                state.waveXPositions = [currentX];
                state.waveDirectionChanges = 0;
                state.lastWaveDirection = null;
                state.waveStartTime = now;
            } else {
                // Track direction changes
                const lastX = state.waveXPositions[state.waveXPositions.length - 1];
                const deltaX = currentX - lastX;
                const moveThreshold = 0.03; // Minimum movement to count as direction

                if (Math.abs(deltaX) > moveThreshold) {
                    state.waveXPositions.push(currentX);
                    const newDirection = deltaX > 0 ? 'right' : 'left';

                    if (state.lastWaveDirection && newDirection !== state.lastWaveDirection) {
                        state.waveDirectionChanges++;
                    }
                    state.lastWaveDirection = newDirection;

                    // Wave detected: 3+ direction changes within 2 seconds
                    if (state.waveDirectionChanges >= 3 && (now - lastGestureTime.current > gestureCooldown)) {
                        if (onSendMessageRef.current) {
                            onSendMessageRef.current("Hi");
                            lastGestureTime.current = now;
                            // Reset wave state
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
        // Check Thumbs Up/Down (Fingers curled)
        else if (fingersExtendedCount <= 1) {
            // Reset wave tracking when palm is not open
            state.waveDirectionChanges = 0;
            state.waveStartTime = 0;
            state.lastWaveDirection = null;
            state.waveXPositions = [];

            // Only allow Yes/No if we saw an Open Palm recently (Wake Window)
            const canTriggerYesNo = (now - state.lastOpenTime) < 2000; // 2 seconds window

            if (canTriggerYesNo) {
                // Thumbs Up: Tip significantly above IP
                if (thumbTip.y < thumbIp.y - 0.05) {
                    currentPose = 'YES';
                }
                // Thumbs Down: Tip significantly below IP
                else if (thumbTip.y > thumbIp.y + 0.05) {
                    currentPose = 'NO';
                }
            }

            // Fist can happen anytime (scrolling)
            // But if we fail Yes/No (due to no wake word), we don't necessarily want to default to FIST immediately if it looks like Yes/No?
            // Actually, Fist requires thumb curled or side. Thumbs up has thumb extended.
            // If we are in "Yes" pose but strict mode blocks it, "currentPose" remains NEUTRAL.
            // We should check that `fingersExtendedCount === 0` strictly for FIST.

            if (currentPose === 'NEUTRAL' && fingersExtendedCount === 0) {
                currentPose = 'FIST';
            }
        } else {
            // For other poses (2-3 fingers extended), reset wave tracking
            state.waveDirectionChanges = 0;
            state.waveStartTime = 0;
            state.lastWaveDirection = null;
            state.waveXPositions = [];
        }

        // -----------------------
        // 3. PERSISTENCE & TRIGGER
        // -----------------------

        // Update persistence
        if (currentPose === persistence.candidate && currentPose !== 'NEUTRAL') {
            persistence.frames++;
        } else {
            persistence.candidate = currentPose;
            persistence.frames = 1;
        }

        // Handle Triggers
        if (now - lastGestureTime.current > gestureCooldown) {
            if (persistence.frames >= PERSISTENCE_THRESHOLD) {
                if (currentPose === 'STOP' && onStopGenerationRef.current) {
                    onStopGenerationRef.current();
                    lastGestureTime.current = now;
                    persistence.frames = 0; // Reset
                    return 'STOP';
                }
                if (currentPose === 'YES' && onSendMessageRef.current) {
                    onSendMessageRef.current("Yes");
                    lastGestureTime.current = now;
                    persistence.frames = 0;
                    return 'THUMBS_UP';
                }
                if (currentPose === 'NO' && onSendMessageRef.current) {
                    onSendMessageRef.current("No");
                    lastGestureTime.current = now;
                    persistence.frames = 0; // Reset
                    return 'THUMBS_DOWN';
                }
            }
        }

        // -----------------------
        // 4. CONTINUOUS ACTIONS (Fist Scroll)
        // -----------------------
        // Scroll is special: it doesn't wait for "Trigger", it works while held.
        // But we rely on correct classification (Fist vs Yes).
        // If currentPose is 'FIST', we scroll.

        if (currentPose === 'FIST') {
            const currentY = wrist.y;
            if (!state.isScrolling) {
                state.isScrolling = true;
                state.lastScrollY = currentY;
            } else if (state.lastScrollY !== null) {
                const delta = (currentY - state.lastScrollY);
                if (Math.abs(delta) > 0.002 && onScrollRef.current) {
                    onScrollRef.current(delta * 1500);
                }
                state.lastScrollY = currentY;
            }
            return 'FIST';
        } else {
            state.isScrolling = false;
            state.lastScrollY = null;
        }

        return currentPose === 'NEUTRAL' ? null : currentPose;
    };

    const draw = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !handLandmarkerRef.current) return;

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
        if (!ctx) return;

        let startTimeMs = performance.now();
        // Detect
        const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw
        if (results.landmarks) {
            // Iterate through all detected hands
            for (let i = 0; i < results.landmarks.length; i++) {
                const landmarks = results.landmarks[i];
                const gesture = detectGesture(landmarks, startTimeMs, i);

                // Dynamic Color based on gesture
                let mainColor = '#3b82f6'; // Default Blue
                let glowColor = '#60a5fa';

                if (gesture === 'STOP') {
                    mainColor = '#ef4444'; // Red
                    glowColor = '#fca5a5';
                } else if (gesture === 'THUMBS_UP') {
                    mainColor = '#22c55e'; // Green
                    glowColor = '#86efac';
                } else if (gesture === 'THUMBS_DOWN') {
                    mainColor = '#f97316'; // Orange
                    glowColor = '#fdba74';
                } else if (gesture === 'FIST') {
                    mainColor = '#a855f7'; // Purple
                    glowColor = '#d8b4fe';
                } else if (gesture === 'PINCH' || gesture === 'TAP') {
                    mainColor = '#ec4899'; // Pink
                    glowColor = '#fbcfe8';
                } else if (gesture === 'POINTING') {
                    mainColor = '#06b6d4'; // Cyan
                    glowColor = '#67e8f9';
                }

                // Draw connections with gradient
                for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
                    const startPoint = landmarks[start];
                    const endPoint = landmarks[end];

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
                    ctx.lineWidth = 2;
                    ctx.shadowColor = mainColor;
                    ctx.shadowBlur = 8;
                    ctx.stroke();
                }

                // Draw landmarks
                for (let j = 0; j < landmarks.length; j++) {
                    const point = landmarks[j];
                    const x = point.x * width;
                    const y = point.y * height;

                    const isFingertip = [4, 8, 12, 16, 20].includes(j);
                    const radius = isFingertip ? 4 : 2;

                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);

                    if (isFingertip) {
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowColor = glowColor;
                        ctx.shadowBlur = 15;
                    } else {
                        ctx.fillStyle = '#1e293b';
                        ctx.strokeStyle = glowColor;
                        ctx.lineWidth = 1.5;
                        ctx.shadowColor = mainColor;
                        ctx.shadowBlur = 5;
                    }

                    ctx.fill();
                    if (!isFingertip) ctx.stroke();
                }

                // Draw Cursor for Pointing
                if (gesture === 'POINTING' || gesture === 'TAP') {
                    const indexTip = landmarks[8];
                    const cx = indexTip.x * width;
                    const cy = indexTip.y * height;

                    // Outer Ring
                    ctx.beginPath();
                    ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
                    ctx.strokeStyle = gesture === 'TAP' ? '#ec4899' : '#06b6d4';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = gesture === 'TAP' ? '#fbcfe8' : '#67e8f9';
                    ctx.shadowBlur = 10;
                    ctx.stroke();

                    // Inner Dot
                    ctx.beginPath();
                    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                }

                // Reset shadow after drawing each hand
                ctx.shadowBlur = 0;
            }
        }

        requestRef.current = requestAnimationFrame(draw);
    };

    useEffect(() => {
        if (loaded && videoRef.current) {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                // Start camera
                navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
                    streamRef.current = stream; // Store for cleanup
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.play();
                        videoRef.current.addEventListener('loadeddata', () => {
                            if (requestRef.current) cancelAnimationFrame(requestRef.current);
                            requestRef.current = requestAnimationFrame(draw);
                        });
                    }
                }).catch(err => {
                    console.error("Error accessing webcam:", err);
                });
            } else {
                console.warn("navigator.mediaDevices is undefined. Camera access requires HTTPS or localhost.");
            }
        }

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
    }, [loaded]);

    // Cleanup effect - runs on unmount to stop camera
    useEffect(() => {
        return () => {
            // Stop animation frame
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = undefined;
            }

            // Stop all camera tracks
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                    track.stop();
                });
                streamRef.current = null;
            }

            // Clear video source
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }

            // Close hand landmarker
            if (handLandmarkerRef.current) {
                handLandmarkerRef.current.close();
                handLandmarkerRef.current = null;
            }
        };
    }, []);

    return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden scale-x-[-1]">
            {/* Video is hidden, we only show the canvas */}
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60 mix-blend-screen" />
        </div>
    )
}
