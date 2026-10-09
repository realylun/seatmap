import { expect, test } from "@playwright/test";
import { openFirstEvent } from "./helpers";

test("user: home -> detail -> pick 2 seats -> hold -> checkout -> order", async ({
  page,
}) => {
  await openFirstEvent(page);
  await expect(page.getByTestId("seat-map")).toBeVisible();

  await page.getByTestId("qty-chip-2").click();
  await page.getByTestId("listing-card").first().click();
  await expect(page.getByTestId("selected-count")).toContainText("2");
  await page.getByTestId("hold-button").click();

  await page.waitForURL(/\/checkout\//);
  await expect(page.getByTestId("countdown")).toBeVisible();

  await page.getByTestId("buyer-email").fill("not-an-email");
  await page.getByTestId("buyer-name").fill("E2E Buyer");
  await page.getByTestId("pay-button").click();
  await expect(page.getByTestId("checkout-error")).toBeVisible();

  await page.getByTestId("buyer-email").fill("buyer@example.com");
  await page.getByTestId("pay-button").click();
  await page.waitForURL(/\/orders\//);
  await expect(page.getByTestId("order-id")).toBeVisible();
  await expect(page.getByTestId("order-seats")).toBeVisible();
});
