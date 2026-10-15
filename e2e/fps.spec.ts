import { expect, test, type Page } from "@playwright/test";
import { openFirstEvent } from "./helpers";

const TELEMETRY = "/api/telemetry/fps";
const MAIN_CALLS_KEY = "__fpsMainThreadCalls";

/** Ghi lại mọi lần main thread gọi sendBeacon/fetch tới endpoint telemetry (lưu qua điều hướng) */
async function spyMainThreadTelemetry(page: Page) {
  await page.addInitScript(
    ({ endpoint, key }) => {
      const record = (kind: string) => {
        const calls: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
        localStorage.setItem(key, JSON.stringify([...calls, kind]));
      };
      const beacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        if (String(url).includes(endpoint)) record("beacon");
        return beacon(url, data);
      };
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (
          String(input instanceof Request ? input.url : input).includes(
            endpoint,
          )
        ) {
          record("fetch");
        }
        return originalFetch(input, init);
      };
    },
    { endpoint: TELEMETRY, key: MAIN_CALLS_KEY },
  );
}

/** Kéo map vài lần để có ≥ 30 frame trong cửa sổ movestart…moveend */
async function panMap(page: Page) {
  const box = await page.getByTestId("seat-map").boundingBox();
  if (!box) throw new Error("seat map not laid out");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 150, cy + 60, { steps: 40 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
}

test("seat map shows an FPS overlay and reports telemetry from a worker", async ({
  page,
}) => {
  const workers: string[] = [];
  const bodies: { sessionId: string; frames: number }[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  page.context().on("request", (r) => {
    if (r.method() === "POST" && r.url().includes(TELEMETRY)) {
      bodies.push(JSON.parse(r.postData() ?? "{}"));
    }
  });
  await spyMainThreadTelemetry(page);

  await openFirstEvent(page);
  const overlay = page.getByTestId("fps-overlay");
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  await expect(overlay).toHaveText(/^\d+ fps · \d+\.\d ms$/, {
    timeout: 2_000,
  });
  await expect(overlay).toHaveAttribute("data-level", /^(good|ok|poor)$/);
  // MapLibre có worker riêng; worker FPS là worker duy nhất còn lại. Bản build production hash
  // tên chunk (turbopack-worker-<hash>.js) nên không dựa vào tên file "fps.worker"
  const fpsWorkers = workers.filter((url) => !url.includes("maplibre-gl"));
  expect(fpsWorkers).toHaveLength(1);
  expect(fpsWorkers[0]).toMatch(/turbopack-worker|fps[._]worker/);

  await panMap(page);
  // 2 nhịp flush (500ms) để worker nhận đủ batch và trả payload về main
  await page.waitForTimeout(1_200);

  await page.goto("/"); // pagehide → sendBeacon
  await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(1);

  const mainCalls: string[] = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
    MAIN_CALLS_KEY,
  );
  expect(mainCalls).toContain("beacon");
  expect(mainCalls).not.toContain("fetch");

  const sessionIds = new Set(bodies.map((b) => b.sessionId));
  expect(sessionIds.size).toBe(1);
  for (const body of bodies) expect(body.frames).toBeGreaterThanOrEqual(30);
});
