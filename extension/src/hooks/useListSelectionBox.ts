import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SelectionPoint = { x: number; y: number };

interface SelectionState {
    origin: SelectionPoint; // Screen coordinates
    current: SelectionPoint; // Screen coordinates
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

// Check if two rectangles overlap - all in screen coordinates
function rectsIntersect(
    r1: { left: number; right: number; top: number; bottom: number },
    r2: { left: number; right: number; top: number; bottom: number }
): boolean {
    return !(
        r1.right < r2.left ||
        r1.left > r2.right ||
        r1.bottom < r2.top ||
        r1.top > r2.bottom
    );
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
            if (clickedOnInteractive) return;

            // Check if we're within the container bounds
            const containerBounds = containerRef.current.getBoundingClientRect();
            const isInsideContainer =
                event.clientX >= containerBounds.left &&
                event.clientX <= containerBounds.right &&
                event.clientY >= containerBounds.top &&
                event.clientY <= containerBounds.bottom;

            if (!isInsideContainer) return;

            // Use screen coordinates for origin
            const point: SelectionPoint = {
                x: event.clientX,
                y: event.clientY,
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
            const point: SelectionPoint = {
                x: event.clientX,
                y: event.clientY,
            };

            setDragSelection((state) => {
                if (!state) return state;
                const rect = normalizeRect(state.origin, point);
                // Lower threshold (2px instead of 4px) for more sensitive detection
                const active = state.active || rect.width > 2 || rect.height > 2;
                return { ...state, current: point, active };
            });
        };

        const handleMouseUp = (event: MouseEvent) => {
            dragSelectionActiveRef.current = false;

            const point: SelectionPoint = {
                x: event.clientX,
                y: event.clientY,
            };

            setDragSelection((state) => {
                if (!state) return null;

                const screenRect = normalizeRect(state.origin, point);

                // Lower minimums for more forgiving selection
                if (state.active && screenRect.width > 1 && screenRect.height > 1) {
                    const matched: number[] = [];

                    // Iterate through all item refs and check intersection using screen coordinates
                    for (const [index, element] of itemRefs.current.entries()) {
                        const itemBounds = element.getBoundingClientRect();

                        // Both rects are now in screen coordinates
                        const intersects = rectsIntersect(
                            {
                                left: screenRect.left,
                                right: screenRect.right,
                                top: screenRect.top,
                                bottom: screenRect.bottom,
                            },
                            {
                                left: itemBounds.left,
                                right: itemBounds.right,
                                top: itemBounds.top,
                                bottom: itemBounds.bottom,
                            }
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

    // Convert screen coordinates to container-relative coordinates for the visual rect
    const selectionRect: SelectionRect | null = useMemo(() => {
        if (!dragSelection || !dragSelection.active || !containerRef.current) return null;

        const containerBounds = containerRef.current.getBoundingClientRect();
        const screenRect = normalizeRect(dragSelection.origin, dragSelection.current);

        if (screenRect.width <= 0 || screenRect.height <= 0) return null;

        // Convert to container-relative coordinates for display
        return {
            left: screenRect.left - containerBounds.left,
            top: screenRect.top - containerBounds.top,
            width: screenRect.width,
            height: screenRect.height,
        };
    }, [dragSelection, containerRef]);

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
