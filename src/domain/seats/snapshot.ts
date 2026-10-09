// Venue (geometry đã build) → danh sách ghế phẳng để snapshot vào event_seats khi tạo event.
import type { Venue } from "../venue/types";
import type { SeatKey } from "./seat-id";

export type SeatRow = SeatKey;

export function snapshotSeats(
  venue: Pick<Venue, "sections">,
): readonly SeatRow[] {
  return venue.sections.flatMap((section) =>
    section.rows.flatMap((row) =>
      row.seats.map(({ properties }) => ({
        section: properties.section,
        row: properties.row,
        seat: String(properties.seat),
      })),
    ),
  );
}
