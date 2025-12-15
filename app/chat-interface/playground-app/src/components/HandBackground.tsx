import { useEffect, useRef, useState } from 'react';
import {
    FilesetResolver,
    HandLandmarker
} from '@mediapipe/tasks-vision';

export default function HandBackground() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);
    const requestRef = useRef<number>();
    const handLandmarkerRef = useRef<HandLandmarker | null>(null);

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
                    numHands: 2
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
            for (const landmarks of results.landmarks) {
                // Draw connections with gradient
                for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
                    const startPoint = landmarks[start];
                    const endPoint = landmarks[end];

                    const gradient = ctx.createLinearGradient(
                        startPoint.x * width, startPoint.y * height,
                        endPoint.x * width, endPoint.y * height
                    );
                    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)'); // Blue-500
                    gradient.addColorStop(1, 'rgba(96, 165, 250, 0.8)'); // Blue-400

                    ctx.beginPath();
                    ctx.moveTo(startPoint.x * width, startPoint.y * height);
                    ctx.lineTo(endPoint.x * width, endPoint.y * height);
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = 2; // Slightly thicker for visibility
                    ctx.shadowColor = '#3b82f6';
                    ctx.shadowBlur = 8;
                    ctx.stroke();
                }

                // Draw landmarks
                for (let i = 0; i < landmarks.length; i++) {
                    const point = landmarks[i];
                    const x = point.x * width;
                    const y = point.y * height;

                    // Depth effect: closer points (smaller negative Z or smaller Z depending on model) appear larger/brighter
                    // Mediapipe Z is relative to wrist. Negative is closer to camera.
                    // We'll trust the 2D simplicity for now but add specific styling.

                    const isFingertip = [4, 8, 12, 16, 20].includes(i);
                    const radius = isFingertip ? 4 : 2;

                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);

                    if (isFingertip) {
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowColor = '#60a5fa'; // Brighter blue
                        ctx.shadowBlur = 15;
                    } else {
                        ctx.fillStyle = '#1e293b'; // Slate-800 center
                        ctx.strokeStyle = '#60a5fa';
                        ctx.lineWidth = 1.5;
                        ctx.shadowColor = '#3b82f6';
                        ctx.shadowBlur = 5;
                    }

                    ctx.fill();
                    if (!isFingertip) ctx.stroke();
                }

                // Reset shadow
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
