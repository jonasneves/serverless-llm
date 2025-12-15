import { useEffect, useRef, useState } from 'react';
import {
    FilesetResolver,
    HandLandmarker,
    DrawingUtils
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
            const drawingUtils = new DrawingUtils(ctx);
            for (const landmarks of results.landmarks) {
                drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                    color: "#3b82f6", // Blue-500
                    lineWidth: 2
                });
                drawingUtils.drawLandmarks(landmarks, {
                    color: "#60a5fa", // Blue-400
                    lineWidth: 1,
                    radius: 3
                });
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
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
            {/* Video is hidden, we only show the canvas */}
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-40 mix-blend-screen" />
        </div>
    )
}
