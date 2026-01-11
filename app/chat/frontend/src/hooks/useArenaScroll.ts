import { useEffect, useRef, RefObject, MutableRefObject } from 'react';
import { LAYOUT } from '../constants';

interface UseArenaScrollParams {
  visualizationAreaRef: RefObject<HTMLDivElement | null>;
  dragSelectionActiveRef: MutableRefObject<boolean>;
}

interface UseArenaScrollReturn {
  arenaOffsetYRef: MutableRefObject<number>;
  arenaTargetYRef: MutableRefObject<number>;
  wheelRafRef: MutableRefObject<number | null>;
  applyOffset: (offset: number) => void;
  clampTarget: (value: number) => number;
  ensureRaf: () => void;
}

export function useArenaScroll({
  visualizationAreaRef,
  dragSelectionActiveRef,
}: UseArenaScrollParams): UseArenaScrollReturn {
  const arenaOffsetYRef = useRef(0);
  const arenaTargetYRef = useRef(0);
  const wheelRafRef = useRef<number | null>(null);
  const touchActiveRef = useRef(false);
  const lastTouchYRef = useRef(0);

  const applyOffset = (offset: number) => {
    const el = visualizationAreaRef.current;
    if (!el) return;
    el.style.setProperty('--arena-offset-y', `${offset}px`);
  };

  const clampTarget = (value: number) =>
    Math.max(-LAYOUT.scrollClamp, Math.min(LAYOUT.scrollClamp, value));

  const step = () => {
    const current = arenaOffsetYRef.current;
    const target = arenaTargetYRef.current;
    const diff = target - current;

    if (Math.abs(diff) < 0.5) {
      arenaOffsetYRef.current = target;
      applyOffset(target);
      wheelRafRef.current = null;
      return;
    }

    const next = current + diff * 0.35;
    arenaOffsetYRef.current = next;
    applyOffset(next);
    wheelRafRef.current = requestAnimationFrame(step);
  };

  const ensureRaf = () => {
    if (wheelRafRef.current == null) {
      wheelRafRef.current = requestAnimationFrame(step);
    }
  };

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (dragSelectionActiveRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && target.closest('input, textarea, [data-no-arena-scroll]')) return;

      event.preventDefault();
      const delta = event.deltaY * 0.9;
      const nextTarget = arenaTargetYRef.current - delta;
      arenaTargetYRef.current = clampTarget(nextTarget);
      ensureRaf();
    };

    const shouldIgnoreTouch = (target: HTMLElement | null) => {
      if (!target) return false;
      return Boolean(
        target.closest('input, textarea, [data-no-arena-scroll], [data-card], button, a, select, [role="button"]')
      );
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (shouldIgnoreTouch(target)) return;
      touchActiveRef.current = true;
      lastTouchYRef.current = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (dragSelectionActiveRef.current) return;
      if (!touchActiveRef.current || event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (shouldIgnoreTouch(target)) {
        touchActiveRef.current = false;
        return;
      }

      const touchY = event.touches[0].clientY;
      const deltaY = touchY - lastTouchYRef.current;
      lastTouchYRef.current = touchY;

      event.preventDefault();
      arenaTargetYRef.current = clampTarget(arenaTargetYRef.current + deltaY);
      ensureRaf();
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      window.removeEventListener('wheel', handleWheel);
      if (wheelRafRef.current != null) {
        cancelAnimationFrame(wheelRafRef.current);
      }
    };
  }, []);

  return {
    arenaOffsetYRef,
    arenaTargetYRef,
    wheelRafRef,
    applyOffset,
    clampTarget,
    ensureRaf,
  };
}
