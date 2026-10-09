import type { Page } from "@playwright/test";
import {
  DEFAULT_EXTENT,
  addSection,
  exportFile,
  updateSection,
} from "../src/domain/venue/venue-file";

const ring: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 5],
  [0, 5],
  [0, 0],
];

/** A tiny venue.json (1 section, 3 rows x 4 seats = 12 seats) as an upload payload. */
export function tinyVenueFile() {
  const draft = updateSection(
    addSection(
      { extent: DEFAULT_EXTENT, sections: [], selectedId: null },
      ring,
    ),
    "S001",
    { rowCount: 3, seatsPerRow: 4 },
  );
  return {
    name: "venue.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exportFile(draft))),
  };
}

export const uniqueSuffix = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Opens the first on-sale event from the home page and returns its URL. */
export async function openFirstEvent(page: Page) {
  await page.goto("/");
  await page.getByTestId("event-card").first().click();
  await page.waitForURL(/\/events\//);
  return page.url();
}

export async function pickSeatsAndHold(page: Page, qty: number) {
  await page.getByTestId(`qty-chip-${qty}`).click();
  await page.getByTestId("listing-card").first().click();
  await page.getByTestId("hold-button").click();
}
