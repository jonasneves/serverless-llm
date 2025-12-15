import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SelectionPoint = { x: number; y: number };

interface SelectionState {
    origin: SelectionPoint;
    current: SelectionPoint;
    active: boolean;
}

interface SelectionRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface UseListSelectionBoxParams {
    containerRef: React.RefObject<HTMLDivElement>;
    itemRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
    setSelectedIndices: React.Dispatch<React.SetStateAction<Set<number>>>;
}

function normalizeRect(a: SelectionPoint, b: SelectionPoint) {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    const bottom = Math.max(a.y, b.y);
    return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
    };
}

export function useListSelectionBox({
    containerRef,
    itemRefs,
    setSelectedIndices,
}: UseListSelectionBoxParams) {
    const [dragSelection, setDragSelection] = useState<SelectionState | null>(null);
    const dragSelectionActiveRef = useRef(false);

    useEffect(() => {
        dragSelectionActiveRef.current = dragSelection != null;
    }, [dragSelection]);

    useEffect(() => {
        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) return;
            if (!containerRef.current) return;

            const target = event.target as HTMLElement | null;
            if (!target) return;

            // Don't start selection if clicking on interactive elements
            const clickedOnInteractive = target.closest('button, a, input, textarea, select, [role="button"]');
            const clickedInNoSelectArea = target.closest('[data-no-arena-scroll]');
            if (clickedOnInteractive || clickedInNoSelectArea) return;

            if (!containerRef.current.contains(target)) return;

            const containerBounds = containerRef.current.getBoundingClientRect();
            const point: SelectionPoint = {
                x: event.clientX - containerBounds.left,
                y: event.clientY - containerBounds.top,
            };

            event.preventDefault();

            dragSelectionActiveRef.current = true;
            setDragSelection({
                origin: point,
                current: point,
                active: false,
            });
        };

        window.addEventListener('mousedown', handleMouseDown, true);
        return () => window.removeEventListener('mousedown', handleMouseDown, true);
    }, [containerRef]);

    useEffect(() => {
        if (!dragSelection || !containerRef.current) return;

        const handleSelectStart = (event: Event) => event.preventDefault();
        document.addEventListener('selectstart', handleSelectStart);

        const handleMouseMove = (event: MouseEvent) => {
            const containerBounds = containerRef.current!.getBoundingClientRect();
            const point: SelectionPoint = {
                x: event.clientX - containerBounds.left,
                y: event.clientY - containerBounds.top,
            };

            setDragSelection((state) => {
                if (!state) return state;
                const rect = normalizeRect(state.origin, point);
                const active = state.active || rect.width > 4 || rect.height > 4;
                return { ...state, current: point, active };
            });
        };

        const handleMouseUp = (event: MouseEvent) => {
            dragSelectionActiveRef.current = false;
            const containerBounds = containerRef.current!.getBoundingClientRect();
            const point: SelectionPoint = {
                x: event.clientX - containerBounds.left,
                y: event.clientY - containerBounds.top,
            };

            setDragSelection((state) => {
                if (!state) return null;

                const rect = normalizeRect(state.origin, point);

                if (state.active && rect.width > 0 && rect.height > 0) {
                    const matched: number[] = [];
                    const currentContainerBounds = containerRef.current!.getBoundingClientRect();
                    const selectionRectScreen = {
                        left: currentContainerBounds.left + rect.left,
                        right: currentContainerBounds.left + rect.right,
                        top: currentContainerBounds.top + rect.top,
                        bottom: currentContainerBounds.top + rect.bottom,
                    };

                    for (const [index, element] of itemRefs.current.entries()) {
                        const itemBounds = element.getBoundingClientRect();
                        const intersects = !(
                            itemBounds.right < selectionRectScreen.left ||
                            itemBounds.left > selectionRectScreen.right ||
                            itemBounds.bottom < selectionRectScreen.top ||
                            itemBounds.top > selectionRectScreen.bottom
                        );

                        if (intersects) matched.push(index);
                    }

                    setSelectedIndices(new Set(matched));
                }

                return null;
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('selectstart', handleSelectStart);
        };
    }, [dragSelection, containerRef, itemRefs, setSelectedIndices]);

    const selectionRect: SelectionRect | null = useMemo(() => {
        if (!dragSelection || !dragSelection.active) return null;
        const rect = normalizeRect(dragSelection.origin, dragSelection.current);
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }, [dragSelection]);

    const clearSelection = useCallback(() => {
        setDragSelection(null);
        dragSelectionActiveRef.current = false;
    }, []);

    return {
        selectionRect,
        isSelecting: dragSelection != null,
        dragSelectionActiveRef,
        clearSelection,
    };
}
