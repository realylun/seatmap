import { describe, expect, it } from "vitest";
import { serializeGeometry } from "./geometry-json";

describe("serializeGeometry", () => {
  it("rounds coordinates to 6 decimals, keeps integers and strings", () => {
    const json = serializeGeometry({
      bounds: [
        [-20, -20],
        [20, 20],
      ],
      at: [0.28431034482758616, -4.421639732758621],
      seat: 12,
      row: "1.5",
    });
    expect(JSON.parse(json)).toEqual({
      bounds: [
        [-20, -20],
        [20, 20],
      ],
      at: [0.28431, -4.42164],
      seat: 12,
      row: "1.5",
    });
  });

  it("does not produce -0", () => {
    expect(serializeGeometry([-0.0000001])).toBe("[0]");
  });

  it("leaves non-finite numbers to JSON (null) instead of hiding them as 0", () => {
    expect(serializeGeometry([Number.NaN, Infinity])).toBe("[null,null]");
  });
});
