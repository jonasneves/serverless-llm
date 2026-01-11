import { useEffect, RefObject } from 'react';
import { Mode } from '../types';

interface UseKeyboardShortcutsParams {
  mode: Mode;
  showSettings: boolean;
  showDock: boolean;
  contextMenu: unknown;
  selectedCardIds: Set<string>;
  selected: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  setShowSettings: (value: boolean) => void;
  setShowDock: (value: boolean) => void;
  setContextMenu: (value: null) => void;
  setSelected: (fn: (prev: string[]) => string[]) => void;
  setSelectedCardIds: (value: Set<string>) => void;
  clearSelection: () => void;
  setHoveredCard: (value: null) => void;
  handleModeChange: (mode: Mode) => void;
}

export function useKeyboardShortcuts({
  mode,
  showSettings,
  showDock,
  contextMenu,
  selectedCardIds,
  selected,
  inputRef,
  setShowSettings,
  setShowDock,
  setContextMenu,
  setSelected,
  setSelectedCardIds,
  clearSelection,
  setHoveredCard,
  handleModeChange,
}: UseKeyboardShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape: unfocus active element, close dock, clear hover
      if (event.key === 'Escape') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && activeEl !== document.body) {
          activeEl.blur();
        }
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (selectedCardIds.size > 0) {
          clearSelection();
          setHoveredCard(null);
          return;
        }
        if (showDock) {
          setShowDock(false);
          return;
        }
        setHoveredCard(null);
        return;
      }

      // Cmd+A / Ctrl+A to select all visible cards (only if not in chat mode)
      if ((event.metaKey || event.ctrlKey) && (event.key === 'a' || event.key === 'A')) {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        if (mode === 'chat') return;

        event.preventDefault();

        if (selected.length > 0) {
          setSelectedCardIds(new Set(selected));
        }
        return;
      }

      // Don't trigger keyboard shortcuts if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const order: Mode[] = ['chat', 'compare', 'analyze', 'debate'];
        const currentIndex = order.indexOf(mode);
        if (currentIndex !== -1) {
          const delta = event.key === 'ArrowRight' ? 1 : -1;
          const nextIndex = (currentIndex + delta + order.length) % order.length;
          handleModeChange(order[nextIndex]);
        }
        return;
      }

      // 'M' toggles models dock
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        setShowDock(!showDock);
        return;
      }

      // Delete or Backspace removes selected cards from arena
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedCardIds.size > 0) {
        event.preventDefault();
        setSelected(prev => prev.filter(id => !selectedCardIds.has(id)));
        clearSelection();
        return;
      }

      // Auto-focus input when typing printable characters
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showDock,
    showSettings,
    contextMenu,
    selectedCardIds,
    mode,
    selected,
    inputRef,
    setShowSettings,
    setShowDock,
    setContextMenu,
    setSelected,
    setSelectedCardIds,
    clearSelection,
    setHoveredCard,
    handleModeChange,
  ]);
}
