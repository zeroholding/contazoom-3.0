import { useReducer } from "react";

export type ProgressAdapter = {
  current: number;
  total: number;
  percentage: number;
  description: string;
};

export type ProgressAction =
  | {
      type: "SET_TOTAL";
      payload: number;
    }
  | {
      type: "SET_CURRENT";
      payload: number;
    }
  | {
      type: "SET_DESCRIPTION";
      payload: string;
    }
  | {
      type: "RESET";
    };

function calculatePercentage(current: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

const initialProgressAdapter: ProgressAdapter = {
  current: 0,
  total: 0,
  percentage: 0,
  description: "",
};

export function progressAdapterReducer(
  state: ProgressAdapter,
  action: ProgressAction
): ProgressAdapter {
  switch (action.type) {
    case "SET_TOTAL": {
      return {
        ...state,
        total: action.payload,
        percentage: calculatePercentage(state.current, action.payload),
      };
    }

    case "SET_CURRENT": {
      return {
        ...state,
        current: action.payload,
        percentage: calculatePercentage(action.payload, state.total),
      };
    }

    case "SET_DESCRIPTION": {
      return {
        ...state,
        description: action.payload,
      };
    }

    case "RESET": {
      return initialProgressAdapter;
    }

    default:
      return state;
  }
}

export function useProgressAdapter() {
  const [state, dispatch] = useReducer(
    progressAdapterReducer,
    initialProgressAdapter
  );

  return {
    progressAdapter: state,
    setTotal: (total: number) =>
      dispatch({ type: "SET_TOTAL", payload: total }),

    setCurrent: (current: number) =>
      dispatch({ type: "SET_CURRENT", payload: current }),

    setDescription: (description: string) =>
      dispatch({ type: "SET_DESCRIPTION", payload: description }),

    reset: () => dispatch({ type: "RESET" }),
  };
}
