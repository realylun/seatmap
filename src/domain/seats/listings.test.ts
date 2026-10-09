import { describe, expect, it } from "vitest";
import {
  buildListings,
  pickSeats,
  rowMinPrice,
  sectionMinPrice,
  type SeatAvailability,
  type SeatStatus,
} from "./listings";

const seat = (
  sid: string,
  tierId: string | null,
  price: number | null,
  status: SeatStatus = "available",
): SeatAvailability => ({ sid, tierId, price, status });

// Section 101 row A: ghế 1-3 + 5 trống (4 đã bán), ghế 10 cùng tier → 3 dải
// Section 101 row B: tier VIP, ghế 1-2 trống
// Section 102 row A: ghế 1 trống, 2 bị giữ, 3 bị khoá; ghế 4 chưa gán tier
const seats: readonly SeatAvailability[] = Object.freeze([
  seat("101|A|10", "std", 500_000),
  seat("101|A|2", "std", 500_000),
  seat("101|A|1", "std", 500_000),
  seat("101|A|3", "std", 500_000),
  seat("101|A|4", "std", 500_000, "sold"),
  seat("101|A|5", "std", 500_000),
  seat("101|B|1", "vip", 1_200_000),
  seat("101|B|2", "vip", 1_200_000),
  seat("102|A|1", "cheap", 300_000),
  seat("102|A|2", "cheap", 300_000, "held"),
  seat("102|A|3", "cheap", 300_000, "blocked"),
  seat("102|A|4", null, null),
]);

const flags = (quantity: number) =>
  buildListings(seats, { quantity }).map((l) => [
    l.id,
    l.isCheapest,
    l.isCheapestInSection,
  ]);

describe("buildListings", () => {
  it("nhóm theo (section,row,tier), chỉ ghế available có tier; sort giá tăng", () => {
    const listings = buildListings(seats);
    expect(
      listings.map((l) => [l.id, l.price, l.availableCount, l.maxRun]),
    ).toEqual([
      ["102|A|cheap", 300_000, 1, 1],
      ["101|A|std", 500_000, 5, 3],
      ["101|B|vip", 1_200_000, 2, 2],
    ]);
  });

  it("dải ghế liền nhau theo số ghế (sắp số tự nhiên, không theo chuỗi)", () => {
    const [, rowA] = buildListings(seats);
    expect(rowA.runs.map((r) => r.seats)).toEqual([
      ["1", "2", "3"],
      ["5"],
      ["10"],
    ]);
    expect(rowA.runs[0].sids).toEqual(["101|A|1", "101|A|2", "101|A|3"]);
  });

  it("ghế khác tier chen giữa → cắt dải", () => {
    const mixed = [
      seat("1|A|1", "x", 1),
      seat("1|A|2", "y", 2),
      seat("1|A|3", "x", 1),
    ];
    const x = buildListings(mixed).find((l) => l.tierId === "x");
    expect(x?.runs.map((r) => r.seats)).toEqual([["1"], ["3"]]);
  });

  it("lọc theo quantity: cần dải ≥ N", () => {
    expect(buildListings(seats, { quantity: 2 }).map((l) => l.id)).toEqual([
      "101|A|std",
      "101|B|vip",
    ]);
    expect(buildListings(seats, { quantity: 3 }).map((l) => l.id)).toEqual([
      "101|A|std",
    ]);
    expect(buildListings(seats, { quantity: 4 })).toEqual([]);
  });

  it("sort giá giảm", () => {
    expect(
      buildListings(seats, { sort: "price-desc" }).map((l) => l.price),
    ).toEqual([1_200_000, 500_000, 300_000]);
  });

  it("cờ cheapest + cheapest in section, tính sau khi lọc", () => {
    expect(flags(1)).toEqual([
      ["102|A|cheap", true, true],
      ["101|A|std", false, true],
      ["101|B|vip", false, false],
    ]);
    expect(flags(2)).toEqual([
      ["101|A|std", true, true],
      ["101|B|vip", false, false],
    ]);
  });

  it("giá listing = giá ghế rẻ nhất trong nhóm", () => {
    const uneven = [seat("1|A|1", "t", 200), seat("1|A|2", "t", 150)];
    expect(buildListings(uneven)[0].price).toBe(150);
  });

  it("không có ghế bán được → []", () => {
    expect(
      buildListings([seat("1|A|1", null, null), seat("1|A|2", "t", 1, "sold")]),
    ).toEqual([]);
  });
});

describe("giá cho price pin", () => {
  const listings = buildListings(seats);
  it("sectionMinPrice", () => {
    expect(Object.fromEntries(sectionMinPrice(listings))).toEqual({
      "101": 500_000,
      "102": 300_000,
    });
  });
  it("rowMinPrice theo khoá section|row", () => {
    expect(Object.fromEntries(rowMinPrice(listings))).toEqual({
      "101|A": 500_000,
      "101|B": 1_200_000,
      "102|A": 300_000,
    });
  });
});

describe("pickSeats", () => {
  const [, rowA] = buildListings(seats);
  it("lấy N ghế đầu tiên của dải đủ dài", () => {
    expect(pickSeats(rowA, 2)).toEqual(["101|A|1", "101|A|2"]);
    expect(pickSeats(rowA, 1)).toEqual(["101|A|1"]);
  });
  it("không đủ ghế liền nhau → null", () => {
    expect(pickSeats(rowA, 4)).toBeNull();
  });
});
