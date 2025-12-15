import { useEffect, useRef, useState } from 'react';
import {
    FilesetResolver,
    HandLandmarker
} from '@mediapipe/tasks-vision';

interface HandBackgroundProps {
    onStopGeneration?: () => void;
    onSendMessage?: (msg: string) => void;
    onModeSwitch?: (direction: 'next' | 'prev') => void;
    onScroll?: (deltaY: number) => void;
    onPinch?: (x: number, y: number) => void;
}

export default function HandBackground({
    onStopGeneration,
    onSendMessage,
    onModeSwitch,
    onScroll,
    onPinch
}: HandBackgroundProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);
    const requestRef = useRef<number>();
    const handLandmarkerRef = useRef<HandLandmarker | null>(null);

    // Gesture State
    const lastGestureTime = useRef<number>(0);
    const gestureCooldown = 1500; // ms between discrete gestures like Yes/No
    const swipeCooldown = 800;
    const pinchCooldown = 500; // debounce pinch clicks

    // Track state per hand to prevent conflicts
    // Key: hand index (0 or 1)
    const handStates = useRef<Map<number, {
        isScrolling: boolean;
        lastScrollY: number | null;
        lastSwipeX: number | null;
    }>>(new Map());

    const getHandState = (index: number) => {
        if (!handStates.current.has(index)) {
            handStates.current.set(index, {
                isScrolling: false,
                lastScrollY: null,
                lastSwipeX: null
            });
        }
        return handStates.current.get(index)!;
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

        // Basic finger states
        // Note: Coordinates are normalized [0,1]. Y increases downwards.

        // 0: Wrist, 4: ThumbTip
        // 8: IndexTip, 6: IndexPIP
        // 12: MiddleTip, 10: MiddlePIP
        // 16: RingTip, 14: RingPIP
        // 20: PinkyTip, 18: PinkyPIP

        const indexExt = landmarks[8].y < landmarks[6].y;
        const middleExt = landmarks[12].y < landmarks[10].y;
        const ringExt = landmarks[16].y < landmarks[14].y;
        const pinkyExt = landmarks[20].y < landmarks[18].y;

        const fingersExtendedCount = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

        // -----------------------
        // 0. PINCH (Click/Select)
        // -----------------------
        // Distance between Thumb Tip (4) and Index Tip (8)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const distance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2)
        );

        // Threshold for pinch. 0.05 is roughly touching.
        if (distance < 0.05) {
            if (now - lastGestureTime.current > pinchCooldown) {
                if (onPinch) {
                    // Calculate midpoint
                    const midX = (thumbTip.x + indexTip.x) / 2;
                    const midY = (thumbTip.y + indexTip.y) / 2;

                    // Mirror X for screen coordinates (Since CSS scales -1)
                    // Visual X = 1 - Normalized X
                    onPinch(1 - midX, midY);

                    lastGestureTime.current = now;
                    return 'PINCH';
                }
            }
        }

        // -----------------------
        // 1. OPEN PALM (Stop)
        // -----------------------
        // Heuristic: All 4 fingers extended
        if (fingersExtendedCount >= 4) {
            state.isScrolling = false;
            state.lastScrollY = null;
            // Trigger Stop if cooldown passed
            if (now - lastGestureTime.current > gestureCooldown) {
                if (onStopGeneration) {
                    onStopGeneration();
                    // Store result but return 'STOP' for visual
                    lastGestureTime.current = now;
                    return 'STOP';
                }
            }
            return 'OPEN';
        }

        // -----------------------
        // 2. FIST (Scroll)
        // -----------------------
        if (fingersExtendedCount === 0) {
            // Fist detected
            const currentY = landmarks[0].y; // Use wrist Y for stability

            if (!state.isScrolling) {
                state.isScrolling = true;
                state.lastScrollY = currentY;
            } else {
                // Determine delta
                if (state.lastScrollY !== null) {
                    const delta = (currentY - state.lastScrollY);
                    // Send scroll event if delta is significant
                    // Threshold to avoid jitter
                    if (Math.abs(delta) > 0.002 && onScroll) {
                        // Pass inverted delta because moving hand up (lower Y) should likely scroll down (content moves up)
                        onScroll(delta * 1500); // Scale factor
                    }
                    state.lastScrollY = currentY;
                }
            }
            return 'FIST';
        } else {
            state.isScrolling = false;
        }

        // -----------------------
        // 3. THUMBS UP / DOWN
        // -----------------------
        // Heuristic: Index/Middle/Ring/Pinky curled (count=0 or 1 loose one)
        if (fingersExtendedCount <= 1) {
            const thumbIP = landmarks[3];

            if (now - lastGestureTime.current > gestureCooldown) {
                // Thumbs UP: Tip is significantly above IP (Remember Y is inverted) -> Tip.y < IP.y
                if (thumbTip.y < thumbIP.y - 0.05) {
                    if (onSendMessage) {
                        onSendMessage("Yes");
                        lastGestureTime.current = now;
                        return 'THUMBS_UP';
                    }
                }

                // Thumbs DOWN: Tip is significantly below IP -> Tip.y > IP.y
                if (thumbTip.y > thumbIP.y + 0.05) {
                    if (onSendMessage) {
                        onSendMessage("No");
                        lastGestureTime.current = now;
                        return 'THUMBS_DOWN';
                    }
                }
            }
        }

        // -----------------------
        // 4. SWIPE (Mode Switch)
        // -----------------------
        // Track Wrist X movement 
        const currentX = landmarks[0].x;
        if (state.lastSwipeX !== null) {
            const dx = currentX - state.lastSwipeX;
            // Detect fast swipe
            if (Math.abs(dx) > 0.15 && (now - lastGestureTime.current > swipeCooldown)) {
                if (onModeSwitch) {
                    // Let's assume standard camera view: Hand moves Right -> dx > 0.
                    // If mirrored on screen, moving "Right" physically (your right) looks like moving Right on screen.

                    if (dx > 0) {
                        onModeSwitch('next');
                    } else {
                        onModeSwitch('prev');
                    }
                    lastGestureTime.current = now;
                    return 'SWIPE';
                }
            }
        }
        state.lastSwipeX = currentX;

        return null;
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
                } else if (gesture === 'PINCH') {
                    mainColor = '#ec4899'; // Pink
                    glowColor = '#fbcfe8';
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
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        }
    }, [loaded]);

    return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden scale-x-[-1]">
            {/* Video is hidden, we only show the canvas */}
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60 mix-blend-screen" />
        </div>
    )
}
