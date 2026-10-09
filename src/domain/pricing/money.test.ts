import { describe, expect, it } from "vitest";
import { formatVnd } from "./money";

describe("formatVnd", () => {
  it.each([
    [0, "0 ₫"],
    [999, "999 ₫"],
    [1000, "1.000 ₫"],
    [1250000, "1.250.000 ₫"],
    [-45000, "-45.000 ₫"],
  ])("%d → %s", (amount, expected) => {
    expect(formatVnd(amount)).toBe(expected);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "từ chối %d",
    (amount) => {
      expect(() => formatVnd(amount)).toThrow(RangeError);
    },
  );
});
