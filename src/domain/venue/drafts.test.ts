import { describe, expect, it } from "vitest";
import { MAX_ROWS, ringToDraft, ROW_DEPTH } from "./drafts";
import type { Point } from "./types";

// Hình chữ nhật 4 × 1.4, sân ở phía dưới (y âm) → cạnh trước là cạnh y = 0
const ring: Point[] = [
  [0, 0],
  [4, 0],
  [4, 1.4],
  [0, 1.4],
  [0, 0],
];

describe("ringToDraft", () => {
  it("cạnh trước quay về tâm venue, số row theo độ sâu", () => {
    const draft = ringToDraft(ring, [2, -10]);
    expect(draft.frontEdge).toBe(0);
    expect(draft.rowCount).toBe(Math.round(1.4 / ROW_DEPTH));
    expect(draft.ring).toEqual(ring);
    expect(draft.ring).not.toBe(ring);
  });

  it("giới hạn số row trong [1, MAX_ROWS]", () => {
    const deep: Point[] = [
      [0, 0],
      [1, 0],
      [1, 100],
      [0, 100],
      [0, 0],
    ];
    expect(ringToDraft(deep, [0.5, -10]).rowCount).toBe(MAX_ROWS);
    const flat: Point[] = [
      [0, 0],
      [4, 0],
      [4, 0.01],
      [0, 0.01],
      [0, 0],
    ];
    expect(ringToDraft(flat, [2, -10]).rowCount).toBe(1);
  });
});
