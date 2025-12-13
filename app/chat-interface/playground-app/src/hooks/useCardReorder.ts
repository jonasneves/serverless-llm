import { useCallback, useEffect, useState } from 'react';
import { LAYOUT } from '../constants';
import { Mode } from '../types';

interface DragState {
  activeId: string;
  currX: number;
  currY: number;
  offsetX: number;
  offsetY: number;
  containerLeft: number;
  containerTop: number;
  containerWidth: number;
  containerHeight: number;
  cardHeight: number;
}

interface UseCardReorderParams {
  visualizationAreaRef: React.RefObject<HTMLDivElement>;
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  mode: Mode;
  gridCols: number;
  getCirclePosition: (index: number, total: number, currentMode: Mode, radius: number) => { x: number; y: number };
}

export function useCardReorder({
  visualizationAreaRef,
  cardRefs,
  selected,
  setSelected,
  mode,
  gridCols,
  getCirclePosition,
}: UseCardReorderParams) {
  const [dragState, setDragState] = useState<DragState | null>(null);

  const handlePointerDown = useCallback((event: React.PointerEvent, modelId: string) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return;
    event.preventDefault();

    const cardEl = cardRefs.current.get(modelId);
    if (!cardEl || !visualizationAreaRef.current) return;

    const rect = cardEl.getBoundingClientRect();
    const vizRect = visualizationAreaRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    setDragState({
      activeId: modelId,
      currX: event.clientX,
      currY: event.clientY,
      offsetX: centerX - event.clientX,
      offsetY: centerY - event.clientY,
      containerLeft: vizRect.left,
      containerTop: vizRect.top,
      containerWidth: vizRect.width,
      containerHeight: vizRect.height,
      cardHeight: rect.height,
    });

    (event.target as Element).setPointerCapture(event.pointerId);
  }, [visualizationAreaRef]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      setDragState(prev => prev ? { ...prev, currX: event.clientX, currY: event.clientY } : null);
      if (!visualizationAreaRef.current) return;

      const vizRect = visualizationAreaRef.current.getBoundingClientRect();
      const currentIndex = selected.indexOf(dragState.activeId);

      let closestDist = Infinity;
      let closestIndex = -1;

      if (mode === 'compare') {
        const relX = event.clientX - (vizRect.left + vizRect.width / 2);
        const relY = event.clientY - vizRect.top;
        const totalWidth = (LAYOUT.cardWidth + LAYOUT.gapX) * gridCols - LAYOUT.gapX;

        selected.forEach((_, idx) => {
          const r = Math.floor(idx / gridCols);
          const c = idx % gridCols;
          const slotX = c * (LAYOUT.cardWidth + LAYOUT.gapX) - totalWidth / 2 + LAYOUT.cardWidth / 2;
          const slotY = r * (LAYOUT.cardHeight + LAYOUT.gapY);
          const slotCenterX = slotX;
          const slotCenterY = slotY + LAYOUT.cardHeight / 2;
          const dist = (relX - slotCenterX) ** 2 + (relY - slotCenterY) ** 2;
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = idx;
          }
        });
      } else {
        const relX = event.clientX - (vizRect.left + vizRect.width / 2);
        const relY = event.clientY - (vizRect.top + vizRect.height / 2);
        const currentRadius = Math.max(LAYOUT.baseRadius, LAYOUT.minRadius + selected.length * LAYOUT.radiusPerModel);

        selected.forEach((_, idx) => {
          const pos = getCirclePosition(idx, selected.length, mode, currentRadius);
          const dist = (relX - pos.x) ** 2 + (relY - pos.y) ** 2;
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = idx;
          }
        });
      }

      if (closestIndex !== -1 && closestIndex !== currentIndex) {
        const newSelected = [...selected];
        const [moved] = newSelected.splice(currentIndex, 1);
        newSelected.splice(closestIndex, 0, moved);
        setSelected(newSelected);
      }
    };

    const handlePointerUp = () => setDragState(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, visualizationAreaRef, cardRefs, selected, setSelected, mode, gridCols, getCirclePosition]);

  return {
    dragState,
    handlePointerDown,
  };
}
