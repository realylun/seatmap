// Logic chọn ghế của SeatAssignMap (thuần, test được): chọn theo section / row / ghế,
// shift = cộng dồn. Selection luôn lưu ở mức ghế (sid) để gửi thẳng lên server action.
import { decodeSid, rowKey } from "@/domain/seats/seat-id";
import { SEAT_LEVEL, SWITCH_LEVEL } from "@/features/seatmap/build-style";

export type PickLevel = "section" | "row" | "seat";

export function levelForZoom(zoom: number): PickLevel {
  if (zoom >= SEAT_LEVEL) return "seat";
  return zoom >= SWITCH_LEVEL ? "row" : "section";
}

export type SeatIndex = {
  readonly bySection: ReadonlyMap<string, readonly string[]>;
  readonly byRow: ReadonlyMap<string, readonly string[]>;
};

function push(map: Map<string, string[]>, key: string, sid: string) {
  const list = map.get(key);
  if (list) list.push(sid);
  else map.set(key, [sid]);
}

export function indexSeats(sids: readonly string[]): SeatIndex {
  const bySection = new Map<string, string[]>();
  const byRow = new Map<string, string[]>();
  for (const sid of sids) {
    const { section, row } = decodeSid(sid);
    push(bySection, section, sid);
    push(byRow, rowKey(section, row), sid);
  }
  return { bySection, byRow };
}

export type Pick =
  | { readonly level: "section"; readonly section: string }
  | { readonly level: "row"; readonly section: string; readonly row: string }
  | { readonly level: "seat"; readonly sid: string };

export function targetSids(index: SeatIndex, pick: Pick): readonly string[] {
  if (pick.level === "section") return index.bySection.get(pick.section) ?? [];
  if (pick.level === "row") {
    return index.byRow.get(rowKey(pick.section, pick.row)) ?? [];
  }
  return [pick.sid];
}

/**
 * Không shift: thay selection bằng target. Shift: nếu target đã chọn hết thì bỏ ra,
 * ngược lại cộng thêm.
 */
export function applyPick(
  selection: ReadonlySet<string>,
  target: readonly string[],
  additive: boolean,
): ReadonlySet<string> {
  if (target.length === 0) return selection;
  if (!additive) return new Set(target);
  const allSelected = target.every((sid) => selection.has(sid));
  const next = new Set(selection);
  for (const sid of target) {
    if (allSelected) next.delete(sid);
    else next.add(sid);
  }
  return next;
}

/** Nhóm đã chọn đủ 100% ghế → highlight ở mức section / row khi zoom xa */
export function fullySelected(
  groups: ReadonlyMap<string, readonly string[]>,
  selection: ReadonlySet<string>,
): string[] {
  return [...groups]
    .filter(
      ([, sids]) => sids.length > 0 && sids.every((s) => selection.has(s)),
    )
    .map(([key]) => key);
}

/** Màu tier chiếm đa số của từng nhóm (section / row); nhóm chưa gán tier thì bỏ qua */
export function dominantColors(
  groups: ReadonlyMap<string, readonly string[]>,
  colorOfSid: (sid: string) => string | null,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [key, sids] of groups) {
    const counts = new Map<string, number>();
    for (const sid of sids) {
      const color = colorOfSid(sid);
      if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    const best = [...counts].reduce<[string, number] | null>(
      (acc, entry) => (!acc || entry[1] > acc[1] ? entry : acc),
      null,
    );
    if (best) out.set(key, best[0]);
  }
  return out;
}
