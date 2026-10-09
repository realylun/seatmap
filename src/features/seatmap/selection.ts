// Ghế đang chọn (sids, theo thứ tự chọn). Reducer thuần → test được, dùng với useReducer.
export const MAX_SELECTION = 8;

export type SelectionAction =
  | { type: "toggle"; sid: string }
  | { type: "replace"; sids: readonly string[] }
  | { type: "clear" }
  /** Sau khi availability đổi: bỏ ghế không còn chọn được */
  | { type: "prune"; isSelectable: (sid: string) => boolean };

export type Selection = readonly string[];

export function selectionReducer(
  state: Selection,
  action: SelectionAction,
): Selection {
  if (action.type === "toggle") {
    if (state.includes(action.sid)) {
      return state.filter((s) => s !== action.sid);
    }
    return state.length >= MAX_SELECTION ? state : [...state, action.sid];
  }
  if (action.type === "replace") {
    return [...new Set(action.sids)].slice(0, MAX_SELECTION);
  }
  if (action.type === "clear") return state.length === 0 ? state : [];
  const next = state.filter(action.isSelectable);
  return next.length === state.length ? state : next;
}

/** Tổng tiền các ghế đang chọn; ghế không rõ giá bỏ qua */
export function selectionTotal(
  selection: Selection,
  priceOf: (sid: string) => number | null,
): number {
  return selection.reduce((sum, sid) => sum + (priceOf(sid) ?? 0), 0);
}
