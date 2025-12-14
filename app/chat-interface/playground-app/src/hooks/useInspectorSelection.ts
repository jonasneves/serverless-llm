import { useCallback, useReducer, SetStateAction } from 'react';

type SelectionState = {
  selectedCardIds: Set<string>;
  pinnedModels: Set<string>;
  activeInspectorId: string | null;
};

type SelectionAction =
  | { type: 'setSelected'; update: SetStateAction<Set<string>> }
  | { type: 'setActive'; update: SetStateAction<string | null> }
  | { type: 'setPinned'; update: SetStateAction<Set<string>> }
  | { type: 'clearSelection' }
  | { type: 'retainPinned' };

const initialState: SelectionState = {
  selectedCardIds: new Set(),
  pinnedModels: new Set(),
  activeInspectorId: null,
};

export function useInspectorSelection() {
  const [state, dispatch] = useReducer(selectionReducer, initialState);

  const setSelectedCardIds = useCallback((update: SetStateAction<Set<string>>) => {
    dispatch({ type: 'setSelected', update });
  }, []);

  const setActiveInspectorId = useCallback((update: SetStateAction<string | null>) => {
    dispatch({ type: 'setActive', update });
  }, []);

  const setPinnedModels = useCallback((update: SetStateAction<Set<string>>) => {
    dispatch({ type: 'setPinned', update });
  }, []);

  const clearInspectorSelection = useCallback(() => {
    dispatch({ type: 'clearSelection' });
  }, []);

  const retainPinnedSelection = useCallback(() => {
    dispatch({ type: 'retainPinned' });
  }, []);

  return {
    selectedCardIds: state.selectedCardIds,
    setSelectedCardIds,
    pinnedModels: state.pinnedModels,
    setPinnedModels,
    activeInspectorId: state.activeInspectorId,
    setActiveInspectorId,
    clearInspectorSelection,
    retainPinnedSelection,
  };
}

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'setSelected': {
      const nextSelected = resolveSetUpdate(state.selectedCardIds, action.update);
      const selectionChanged = !setsEqual(state.selectedCardIds, nextSelected);
      const nextActive = reconcileActive(state.activeInspectorId, nextSelected);
      if (!selectionChanged && nextActive === state.activeInspectorId) {
        return state;
      }
      return {
        ...state,
        selectedCardIds: selectionChanged ? nextSelected : state.selectedCardIds,
        activeInspectorId: nextActive,
      };
    }
    case 'setActive': {
      const requested = resolveValue(state.activeInspectorId, action.update);
      const nextActive = requested && state.selectedCardIds.has(requested)
        ? requested
        : reconcileActive(requested, state.selectedCardIds);
      if (nextActive === state.activeInspectorId) {
        return state;
      }
      return { ...state, activeInspectorId: nextActive };
    }
    case 'setPinned': {
      const nextPinned = resolveSetUpdate(state.pinnedModels, action.update);
      if (setsEqual(state.pinnedModels, nextPinned)) {
        return state;
      }
      return { ...state, pinnedModels: nextPinned };
    }
    case 'clearSelection': {
      if (state.selectedCardIds.size === 0 && state.activeInspectorId == null) {
        return state;
      }
      return { ...state, selectedCardIds: new Set(), activeInspectorId: null };
    }
    case 'retainPinned': {
      if (state.pinnedModels.size === 0) {
        if (state.selectedCardIds.size === 0 && state.activeInspectorId == null) {
          return state;
        }
        return { ...state, selectedCardIds: new Set(), activeInspectorId: null };
      }
      const pinnedSelected = new Set(
        [...state.selectedCardIds].filter(id => state.pinnedModels.has(id))
      );
      if (pinnedSelected.size === 0) {
        if (state.selectedCardIds.size === 0 && state.activeInspectorId == null) {
          return state;
        }
        return { ...state, selectedCardIds: new Set(), activeInspectorId: null };
      }
      const nextActive = reconcileActive(state.activeInspectorId, pinnedSelected);
      if (
        setsEqual(state.selectedCardIds, pinnedSelected) &&
        nextActive === state.activeInspectorId
      ) {
        return state;
      }
      return {
        ...state,
        selectedCardIds: pinnedSelected,
        activeInspectorId: nextActive,
      };
    }
    default:
      return state;
  }
}

function resolveSetUpdate(
  prev: Set<string>,
  update: SetStateAction<Set<string>>,
): Set<string> {
  const next = typeof update === 'function' ? update(prev) : update;
  return new Set(next);
}

function resolveValue<T>(prev: T, update: SetStateAction<T>): T {
  if (typeof update === 'function') {
    return (update as (value: T) => T)(prev);
  }
  return update;
}

function reconcileActive(
  current: string | null,
  selection: Set<string>,
): string | null {
  if (selection.size === 0) return null;
  if (current && selection.has(current)) return current;
  const first = selection.values().next();
  return first.done ? null : first.value;
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}
