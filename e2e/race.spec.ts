import { expect, test } from "@playwright/test";
import { openFirstEvent, pickSeatsAndHold } from "./helpers";

test("two contexts race for the same seat: exactly one reaches checkout", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

  const url = await openFirstEvent(a);
  await b.goto(url);
  await Promise.all([
    a.getByTestId("listing-card").first().waitFor(),
    b.getByTestId("listing-card").first().waitFor(),
  ]);

  await Promise.all([pickSeatsAndHold(a, 1), pickSeatsAndHold(b, 1)]);

  const outcome = (page: typeof a) =>
    Promise.race([
      page.waitForURL(/\/checkout\//).then(() => "won" as const),
      page
        .getByTestId("hold-error")
        .waitFor()
        .then(() => "lost" as const),
    ]);
  const results = await Promise.all([outcome(a), outcome(b)]);
  expect(results.toSorted()).toEqual(["lost", "won"]);

  await ctxA.close();
  await ctxB.close();
});
