import { useReducer } from 'react';
import { ChatAutoModeScope } from '../components/ChatView';

interface ModelSelectionState {
    autoMode: boolean;
    autoModeScope: ChatAutoModeScope;
    selectedModelId: string | null;
}

type ModelSelectionAction =
    | { type: 'SET_AUTO_MODE'; payload: boolean }
    | { type: 'SET_AUTO_MODE_SCOPE'; payload: ChatAutoModeScope }
    | { type: 'SELECT_MODEL'; payload: string };

const initialState: ModelSelectionState = {
    autoMode: true,
    autoModeScope: 'local',
    selectedModelId: null,
};

function modelSelectionReducer(
    state: ModelSelectionState,
    action: ModelSelectionAction
): ModelSelectionState {
    switch (action.type) {
        case 'SET_AUTO_MODE':
            return {
                ...state,
                autoMode: action.payload,
            };
        case 'SET_AUTO_MODE_SCOPE':
            return {
                ...state,
                autoMode: true,
                autoModeScope: action.payload,
            };
        case 'SELECT_MODEL':
            return {
                ...state,
                selectedModelId: action.payload,
            };
        default:
            return state;
    }
}

export function useModelSelection(initial?: Partial<ModelSelectionState>) {
    const [state, dispatch] = useReducer(
        modelSelectionReducer,
        { ...initialState, ...initial }
    );

    return {
        // State
        autoMode: state.autoMode,
        autoModeScope: state.autoModeScope,
        selectedModelId: state.selectedModelId,

        // Actions
        setAutoMode: (enabled: boolean) =>
            dispatch({ type: 'SET_AUTO_MODE', payload: enabled }),
        setAutoModeScope: (scope: ChatAutoModeScope) =>
            dispatch({ type: 'SET_AUTO_MODE_SCOPE', payload: scope }),
        selectModel: (id: string) =>
            dispatch({ type: 'SELECT_MODEL', payload: id }),
    };
}
