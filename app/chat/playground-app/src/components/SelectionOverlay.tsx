

interface SelectionRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface SelectionOverlayProps {
    rect: SelectionRect | null;
}

export default function SelectionOverlay({ rect }: SelectionOverlayProps) {
    if (!rect) return null;

    return (
        <div
            className="absolute pointer-events-none z-40"
            style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                border: '2px solid rgb(59, 130, 246)', // blue-500
                backgroundColor: 'rgba(59, 130, 246, 0.1)', // blue-500/10
            }}
        />
    );
}
