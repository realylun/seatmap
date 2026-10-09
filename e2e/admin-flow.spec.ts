import { expect, test } from "@playwright/test";
import { tinyVenueFile, uniqueSuffix } from "./helpers";

test("admin: import venue.json, publish, create event, tier, assign, on sale", async ({
  page,
}) => {
  const id = uniqueSuffix();
  const venueName = `E2E Venue ${id}`;

  await page.goto("/admin/venues");
  await page.getByLabel("Name").fill(venueName);
  await page.getByLabel("City").fill("Ho Chi Minh");
  await page.getByRole("button", { name: "Create venue" }).click();
  await expect(page.getByRole("heading", { name: venueName })).toBeVisible();

  await page.goto("/admin/templates");
  await page
    .locator('select[name="venueId"]')
    .selectOption({ label: `${venueName} (Ho Chi Minh)` });
  await page.getByLabel("Name").fill(`Template ${id}`);
  await page.getByLabel(/Import venue\.json/).setInputFiles(tinyVenueFile());
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.locator("#editor-root")).toBeVisible();
  await page.getByRole("button", { name: "Publish version" }).click();
  await expect(page.getByRole("cell", { name: "v1" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "12", exact: true }).first(),
  ).toBeVisible();

  await page.goto("/admin/events/new");
  await page.getByLabel("Name").fill(`E2E Event ${id}`);
  await page.getByLabel("Slug").fill(`e2e-${id}`);
  await page.getByLabel("Starts at").fill("2030-01-01T19:00");
  await page
    .getByLabel("Template version")
    .selectOption({ label: `${venueName} / Template ${id} v1 (12 seats)` });
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(
    page.getByRole("heading", { name: `E2E Event ${id}` }),
  ).toBeVisible();

  const addTier = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add tier" }) });
  await addTier.getByLabel("Name").fill("General");
  await addTier.getByLabel("Price (VND)").fill("500000");
  await addTier.getByRole("button", { name: "Add tier" }).click();
  await expect(
    page.getByRole("cell", { name: "12", exact: true }).first(),
  ).toBeVisible();

  const assign = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Apply tier" }) });
  await assign.getByLabel(/Section ids/).fill("S001");
  await assign.getByLabel("Tier").selectOption({ label: "General" });
  await assign.getByRole("button", { name: "Apply tier" }).click();

  await page.getByRole("button", { name: "Put on sale" }).click();
  await expect(page.getByText("on_sale")).toBeVisible();
});
