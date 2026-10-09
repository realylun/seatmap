import { describe, expect, it } from "vitest";
import { decodeSid, encodeSid, rowKey } from "./seat-id";

describe("seat id", () => {
  it("encode / decode vòng tròn", () => {
    const key = { section: "101", row: "AA", seat: "12" };
    expect(encodeSid(key)).toBe("101|AA|12");
    expect(decodeSid("101|AA|12")).toEqual(key);
  });

  it("rowKey", () => {
    expect(rowKey("101", "B")).toBe("101|B");
  });

  it.each(["", "101|A", "101||1", "a|b|c|d"])("decode từ chối %j", (sid) => {
    expect(() => decodeSid(sid)).toThrow(/không hợp lệ/);
  });

  it("encode từ chối phần rỗng hoặc chứa '|'", () => {
    expect(() => encodeSid({ section: "1|0", row: "A", seat: "1" })).toThrow(
      /section/,
    );
    expect(() => encodeSid({ section: "1", row: "", seat: "1" })).toThrow(
      /row/,
    );
  });
});
