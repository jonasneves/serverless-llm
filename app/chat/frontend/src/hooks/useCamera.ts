import { useRef, useState, useCallback, useEffect } from 'react';

// getUserMedia camera with a frame grabber. captureFrame() draws the current video
// frame to an offscreen canvas (downscaled to maxDim) for the VL model to consume.
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API unavailable — needs HTTPS (or localhost).');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not access camera');
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const captureFrame = useCallback((maxDim = 768): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended) return null;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (!w || !h) return null;
    if (Math.max(w, h) > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
    return canvas;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, active, error, start, stop, captureFrame };
}
