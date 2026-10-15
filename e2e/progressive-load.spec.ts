import { expect, test, type Page } from "@playwright/test";

// Venue lớn nhất của seed (SVĐ Trống Đồng, 135k ghế, 160 section): toàn sân ở zoom thấp hơn mức tải
// ghế, nên lần tải đầu chỉ có overview. Venue nhỏ có thể vừa khung ở zoom đã tải ghế.
const BIG_EVENT = "/events/vietnam-vs-korea-trong-dong";

const CHUNK = /\/s\/\d+\.json$/;
const FULL_GEOMETRY = /\/v\d+\.json$/;

/** Ghi lại pathname của mọi request geometry (overview, chunk, file đầy đủ) */
function recordGeometry(page: Page): string[] {
  const paths: string[] = [];
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    if (pathname.includes("/geometry/")) paths.push(pathname);
  });
  return paths;
}

const loadedSections = (page: Page) =>
  page.getByTestId("seat-map").locator("[data-seat-sections]");

test("seat map loads only the overview for the whole-venue view", async ({
  page,
}) => {
  const geometry = recordGeometry(page);
  await page.goto(BIG_EVENT);
  await expect(loadedSections(page)).toHaveAttribute("data-seat-sections", "0");
  await expect(page.getByTestId("seat-count")).toBeVisible();
  // map đứng yên ở toàn sân: vẫn không tải chunk nào
  await page.waitForTimeout(1000);
  await expect(loadedSections(page)).toHaveAttribute("data-seat-sections", "0");

  expect(geometry.some((p) => p.endsWith("/overview.json"))).toBe(true);
  expect(geometry.filter((p) => FULL_GEOMETRY.test(p))).toEqual([]);
  expect(geometry.filter((p) => CHUNK.test(p))).toEqual([]);
});

test("picking a listing loads that section's seats", async ({ page }) => {
  const geometry = recordGeometry(page);
  await page.goto(BIG_EVENT);
  await expect(loadedSections(page)).toHaveAttribute("data-seat-sections", "0");

  await page.getByTestId("listing-card").first().click();
  await expect(page.getByTestId("selected-count")).toContainText("1");
  await expect
    .poll(async () =>
      Number(await loadedSections(page).getAttribute("data-seat-sections")),
    )
    .toBeGreaterThan(0);
  expect(geometry.filter((p) => CHUNK.test(p)).length).toBeGreaterThan(0);
  expect(geometry.filter((p) => FULL_GEOMETRY.test(p))).toEqual([]);
});
