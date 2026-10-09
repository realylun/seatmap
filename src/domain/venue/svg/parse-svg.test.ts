import { describe, expect, it } from "vitest";
import { applyMatrix } from "./svg-geometry";
import { flatten, idData, parseSvg, type SvgDoc } from "./parse-svg";

const ok = (text: string): SvgDoc => {
  const r = parseSvg(text);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const byId = (doc: SvgDoc, id: string) => {
  const node = flatten(doc.root).find((n) => n.id === id);
  if (!node) throw new Error(`không thấy #${id}`);
  return node;
};

describe("parseSvg: viewBox", () => {
  it("đọc viewBox; matrix gốc dời minX/minY về 0", () => {
    const doc = ok(
      `<svg viewBox="-10 20 200 100"><rect id="r" width="1" height="1"/></svg>`,
    );
    expect(doc.viewBox).toEqual({
      minX: -10,
      minY: 20,
      width: 200,
      height: 100,
    });
    expect(applyMatrix(byId(doc, "r").matrix, [-10, 20])).toEqual([0, 0]);
  });

  it("thiếu viewBox → dùng width/height (bỏ px)", () => {
    const doc = ok(`<svg width="300px" height="150"></svg>`);
    expect(doc.viewBox).toEqual({ minX: 0, minY: 0, width: 300, height: 150 });
  });

  it("không có kích thước / viewBox hỏng / không phải svg / XML hỏng → lỗi", () => {
    expect(parseSvg(`<svg></svg>`).ok).toBe(false);
    expect(parseSvg(`<svg viewBox="0 0 0 10"></svg>`).ok).toBe(false);
    expect(parseSvg(`<html></html>`).ok).toBe(false);
    expect(parseSvg(`<svg viewBox="0 0 1 1"><g></svg>`).ok).toBe(false);
    expect(parseSvg(``).ok).toBe(false);
  });

  it("bỏ qua khai báo XML, comment, DOCTYPE", () => {
    const doc = ok(
      `<?xml version="1.0"?><!DOCTYPE svg><!-- export --><svg viewBox="0 0 1 1"><g id="a"/></svg>`,
    );
    expect(byId(doc, "a").tag).toBe("g");
  });
});

describe("parseSvg: transform lồng nhau", () => {
  it("gộp parent · child, child áp trước", () => {
    const doc = ok(`<svg viewBox="0 0 100 100">
      <g transform="translate(10 0)">
        <g transform="scale(2)"><circle id="c" cx="1" cy="1" r="1"/></g>
      </g></svg>`);
    expect(applyMatrix(byId(doc, "c").matrix, [1, 1])).toEqual([12, 2]);
  });

  it("transform không đọc được → lỗi có id phần tử", () => {
    const r = parseSvg(
      `<svg viewBox="0 0 1 1"><g id="bad" transform="wobble(1)"/></svg>`,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("#bad");
  });
});

describe("parseSvg: data-* và kế thừa", () => {
  it("data-* của cha truyền xuống con, con ghi đè", () => {
    const doc = ok(`<svg viewBox="0 0 1 1">
      <g data-section="311" data-rows="20">
        <g data-row="A"><circle id="s" data-seat="12" cx="0" cy="0" r="1"/></g>
        <g data-row="B" data-section="312"><circle id="t" data-seat="1"/></g>
      </g></svg>`);
    expect(byId(doc, "s").data).toEqual({
      section: "311",
      rows: "20",
      row: "A",
      seat: "12",
    });
    expect(byId(doc, "t").data).toMatchObject({ section: "312", row: "B" });
  });

  it("id kiểu Figma/Illustrator suy ra data khi thiếu data-*", () => {
    const doc = ok(`<svg viewBox="0 0 1 1">
      <g id="sec-311">
        <path id="outline" d="M0 0 H1 V1 Z"/>
        <g id="row-A_2"><circle id="seat-12_3_" cx="0" cy="0" r="1"/></g>
      </g>
      <path id="field" d="M0 0 H1 V1 Z"/></svg>`);
    expect(byId(doc, "seat-12_3_").data).toEqual({
      section: "311",
      row: "A",
      seat: "12",
    });
    expect(byId(doc, "outline").data).toEqual({
      section: "311",
      role: "outline",
    });
    expect(byId(doc, "field").data).toEqual({ kind: "field" });
  });

  it("data-* tường minh thắng id", () => {
    const doc = ok(
      `<svg viewBox="0 0 1 1"><g id="sec-1" data-section="2"/></svg>`,
    );
    expect(byId(doc, "sec-1").data.section).toBe("2");
  });
});

describe("parseSvg: bỏ qua phần không vẽ", () => {
  it("defs / clipPath / style / display:none bị bỏ", () => {
    const doc = ok(`<svg viewBox="0 0 1 1">
      <defs><circle id="d"/></defs>
      <clipPath id="cp"><rect id="cr"/></clipPath>
      <style>.a{}</style>
      <g id="hidden" display="none"><circle id="h"/></g>
      <g id="hidden2" style="fill:red; display : none"><circle id="h2"/></g>
      <circle id="v"/></svg>`);
    const ids = flatten(doc.root).map((n) => n.id);
    expect(ids).toEqual([null, "v"]);
  });

  it("giữ attrs (đã decode entity) và text con không thành node", () => {
    const doc = ok(
      `<svg viewBox="0 0 1 1"><text id="a&amp;b" x="3">311</text></svg>`,
    );
    const node = byId(doc, "a&b");
    expect(node.attrs.x).toBe("3");
    expect(node.children).toEqual([]);
  });
});

describe("parseSvg: an toàn", () => {
  it("entity DOCTYPE lồng nhau (billion laughs) không bị nở trong attribute", () => {
    const lol = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><svg viewBox="0 0 1 1"><g id="&c;&c;&c;&c;"/></svg>`;
    const r = parseSvg(lol);
    const ids = r.ok ? flatten(r.value.root).map((n) => n.id ?? "") : [];
    expect(Math.max(0, ...ids.map((id) => id.length))).toBeLessThan(100);
  });
});

describe("idData", () => {
  it.each([
    ["sec-311", { section: "311" }],
    ["sec-C-101", { section: "C-101" }],
    ["sec-311_2", { section: "311" }],
    ["row-AA", { row: "AA" }],
    ["seat-7", { seat: "7" }],
    ["seat-x", {}],
    ["outline", { role: "outline" }],
    ["label_1_", { role: "label" }],
    ["field", { kind: "field" }],
    ["stage", { kind: "stage" }],
    ["Layer_1", {}],
  ])("%s", (id, expected) => {
    expect(idData(id)).toEqual(expected);
  });
});
