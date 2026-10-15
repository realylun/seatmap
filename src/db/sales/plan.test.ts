import { describe, expect, it } from "vitest";
import { seededRandom } from "@/db/seed/seed-database";
import { planSales, type SaleSeat } from "./plan";

function seats(section: string, rows: number, perRow: number, tierRank = 0) {
  return Array.from({ length: rows * perRow }, (_, i) => ({
    id: hash(`${section}-${i}`),
    section,
    row: String(Math.floor(i / perRow) + 1),
    seat: String((i % perRow) + 1),
    tierRank,
  })) satisfies SaleSeat[];
}

function hash(text: string): number {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const base = { tierRates: [0.8, 0.5, 0.2], demand: 1, soldOutChance: 0 };

describe("planSales", () => {
  it("never puts a seat in two orders and caps orders at 8 seats", () => {
    const all = [...seats("A", 20, 30), ...seats("B", 20, 30, 2)];
    const groups = planSales(all, { ...base, rng: seededRandom(1) });
    const ids = groups.flat();
    expect(new Set(ids).size).toBe(ids.length);
    expect(groups.every((g) => g.length >= 1 && g.length <= 8)).toBe(true);
  });

  it("keeps each order inside one row of one section, seats side by side", () => {
    const all = seats("A", 10, 40);
    const byId = new Map(all.map((s) => [s.id, s]));
    for (const group of planSales(all, { ...base, rng: seededRandom(2) })) {
      const picked = group.map((id) => byId.get(id)!);
      expect(new Set(picked.map((s) => `${s.section}|${s.row}`)).size).toBe(1);
      const nums = picked.map((s) => Number(s.seat));
      expect(Math.max(...nums) - Math.min(...nums)).toBe(group.length - 1);
    }
  });

  it("sells more of the expensive zones than the cheap ones", () => {
    const vip = seats("VIP", 40, 50, 0);
    const cheap = seats("CHEAP", 40, 50, 2);
    const sold = new Set(
      planSales([...vip, ...cheap], { ...base, rng: seededRandom(3) }).flat(),
    );
    const share = (zone: SaleSeat[]) =>
      zone.filter((s) => sold.has(s.id)).length / zone.length;
    expect(share(vip)).toBeGreaterThan(share(cheap));
    expect(share(cheap)).toBeGreaterThan(0);
  });

  it("sells a whole section when it rolls sold-out", () => {
    const all = seats("A", 5, 10);
    const groups = planSales(all, {
      ...base,
      soldOutChance: 1,
      rng: seededRandom(4),
    });
    expect(groups.flat().length).toBe(all.length);
  });

  it("resumes: a rerun only buys groups whose seats are all still available", () => {
    const all = seats("A", 10, 20);
    const opts = { ...base, rng: seededRandom(6) };
    const first = planSales(all, opts);
    const sold = new Set(first.slice(0, 5).flat());
    const halfDone = all.map((s) => ({ ...s, available: !sold.has(s.id) }));
    const rerun = planSales(halfDone, { ...base, rng: seededRandom(6) });
    expect(rerun).toEqual(first.slice(5));
  });

  it("is deterministic for the same seed", () => {
    const all = seats("A", 10, 20);
    const run = () => planSales(all, { ...base, rng: seededRandom(5) });
    expect(run()).toEqual(run());
  });
});
