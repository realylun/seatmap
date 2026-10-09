import { describe, expect, it } from "vitest";
import { hasVenueData, loadVenueJson } from "../__fixtures__/study";
import { venueSchema } from "../venue/types";
import {
  addSection,
  buildVenue,
  DEFAULT_EXTENT,
  type VenueDraft,
} from "../venue/venue-file";
import { encodeSid } from "./seat-id";
import { snapshotSeats } from "./snapshot";

describe("snapshotSeats", () => {
  it("venue tự build → ghế phẳng, seat là chuỗi", () => {
    const empty: VenueDraft = {
      extent: DEFAULT_EXTENT,
      sections: [],
      selectedId: null,
    };
    const draft = addSection(empty, [
      [0, 0],
      [3, 0],
      [3, 2],
      [0, 2],
      [0, 0],
    ]);
    const venue = buildVenue({
      ...draft,
      sections: [{ ...draft.sections[0], rowCount: 2, seatsPerRow: 3 }],
    });
    expect(snapshotSeats(venue)).toEqual([
      { section: "S001", row: "A", seat: "1" },
      { section: "S001", row: "A", seat: "2" },
      { section: "S001", row: "A", seat: "3" },
      { section: "S001", row: "B", seat: "1" },
      { section: "S001", row: "B", seat: "2" },
      { section: "S001", row: "B", seat: "3" },
    ]);
  });

  it("ghế đặt tay (explicitRows) → giữ nguyên số ghế gốc", () => {
    const empty: VenueDraft = {
      extent: DEFAULT_EXTENT,
      sections: [],
      selectedId: null,
    };
    const draft = addSection(empty, [
      [0, 0],
      [3, 0],
      [3, 2],
      [0, 2],
      [0, 0],
    ]);
    const venue = buildVenue({
      ...draft,
      sections: [
        {
          ...draft.sections[0],
          explicitRows: [
            {
              name: "A",
              seats: [
                { number: 12, at: [2, 1] },
                { number: 11, at: [1, 1] },
              ],
            },
          ],
        },
      ],
    });
    expect(snapshotSeats(venue)).toEqual([
      { section: "S001", row: "A", seat: "11" },
      { section: "S001", row: "A", seat: "12" },
    ]);
  });

  it.skipIf(!hasVenueData)(
    "rosetta: 10278 ghế / 95 section, sid duy nhất",
    () => {
      const venue = venueSchema.parse(loadVenueJson("venue.rosetta.json"));
      const seats = snapshotSeats(venue);
      expect(seats).toHaveLength(10278);
      expect(new Set(seats.map((s) => s.section)).size).toBe(95);
      expect(new Set(seats.map(encodeSid)).size).toBe(10278);
    },
  );
});
