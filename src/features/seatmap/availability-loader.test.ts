import { describe, expect, it, vi } from "vitest";
import {
  LAYOUT_MAX_AGE_MS,
  createAvailabilityLoader,
} from "./availability-loader";

const EVENT = "e1";
const tier = { id: "t1", name: "T", price: 1, color: "#000" };
const layoutA = { tiers: [tier], groups: [[0, ["A|1|1"]]] };
const layoutB = { tiers: [tier], groups: [[-1, ["A|1|1"]]] };
const status = { seats: [] };

type Pending = {
  url: string;
  signal: AbortSignal;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

/** fetch giả: giữ request treo để test abort / thứ tự */
function fakeFetch() {
  const calls: Pending[] = [];
  const fetchJson = (url: string, signal: AbortSignal) =>
    new Promise<unknown>((resolve, reject) => {
      calls.push({ url, signal, resolve, reject });
      signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });
  const respond = (pred: (url: string) => boolean, body: unknown) => {
    const c = calls.find((x) => pred(x.url) && !x.signal.aborted);
    if (!c) throw new Error("no pending call");
    calls.splice(calls.indexOf(c), 1);
    c.resolve(body);
  };
  return { calls, fetchJson, respond };
}

const isLayout = (u: string) => u.includes("/layout");
const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(now = () => 0) {
  const f = fakeFetch();
  const onData = vi.fn();
  const onError = vi.fn();
  const loader = createAvailabilityLoader({
    eventId: EVENT,
    fetchJson: f.fetchJson,
    onData,
    onError,
    now,
  });
  /** refresh + trả lời ngay mọi request đang chờ */
  const run = async (
    p: Promise<void>,
    layout: unknown = layoutA,
  ): Promise<void> => {
    await settle();
    const pending = f.calls.filter((c) => !c.signal.aborted);
    for (const c of pending)
      f.respond((u) => u === c.url, isLayout(c.url) ? layout : status);
    await p;
  };
  return { ...f, loader, onData, onError, run, settle };
}

const urls = (calls: { url: string }[]) => calls.map((c) => c.url);

describe("createAvailabilityLoader", () => {
  it("fetches layout once (CDN url), then only status", async () => {
    const t = setup();
    await t.run(t.loader.refresh());
    expect(t.onData).toHaveBeenCalledTimes(1);
    const p = t.loader.refresh();
    await t.settle();
    expect(urls(t.calls)).toEqual([`/api/events/${EVENT}/availability`]);
    await t.run(p);
    expect(t.onData).toHaveBeenCalledTimes(2);
  });

  it("refresh(true) busts only the status cache", async () => {
    const t = setup();
    await t.run(t.loader.refresh());
    const p = t.loader.refresh(true);
    await t.settle();
    expect(urls(t.calls)).toEqual([
      expect.stringMatching(/\/availability\?fresh=\d+$/),
    ]);
    await t.run(p);
  });

  it("a fresh layout reload survives being aborted by a later poll", async () => {
    const t = setup();
    await t.run(t.loader.refresh());
    const reload = t.loader.refresh(true, true);
    await t.settle();
    expect(t.calls.some((c) => /\/layout\?fresh=/.test(c.url))).toBe(true);
    // poll tick chen ngang → abort reload
    const poll = t.loader.refresh();
    await reload;
    await t.settle();
    expect(t.calls.some((c) => /\/layout\?fresh=/.test(c.url))).toBe(true);
    await t.run(poll, layoutB);
    expect(t.onData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        seats: [expect.objectContaining({ tierId: null })],
      }),
    );
    // đã nạp thành công → poll sau không tải layout nữa
    const next = t.loader.refresh();
    await t.settle();
    const live = t.calls.filter((c) => !c.signal.aborted);
    expect(urls(live)).toEqual([`/api/events/${EVENT}/availability`]);
    await t.run(next);
  });

  it("aborted refresh writes nothing", async () => {
    const t = setup();
    const first = t.loader.refresh();
    await t.settle();
    const firstCalls = [...t.calls];
    const second = t.loader.refresh();
    await first;
    expect(firstCalls.every((c) => c.signal.aborted)).toBe(true);
    expect(t.onData).not.toHaveBeenCalled();
    expect(t.onError).not.toHaveBeenCalled();
    await t.run(second);
    expect(t.onData).toHaveBeenCalledTimes(1);
  });

  it("markLayoutStale reloads via the CDN url; old layouts reload after LAYOUT_MAX_AGE_MS", async () => {
    let clock = 0;
    const t = setup(() => clock);
    await t.run(t.loader.refresh());

    t.loader.markLayoutStale();
    const p = t.loader.refresh();
    await t.settle();
    expect(urls(t.calls)).toContain(`/api/events/${EVENT}/layout`);
    await t.run(p);

    clock = LAYOUT_MAX_AGE_MS - 1;
    const notYet = t.loader.refresh();
    await t.settle();
    expect(t.calls.some((c) => c.url.includes("/layout"))).toBe(false);
    await t.run(notYet);

    clock = LAYOUT_MAX_AGE_MS;
    const due = t.loader.refresh();
    await t.settle();
    expect(urls(t.calls)).toContain(`/api/events/${EVENT}/layout`);
    await t.run(due);
  });

  it("reports errors without throwing", async () => {
    const t = setup();
    const p = t.loader.refresh();
    await t.settle();
    t.calls[0].reject(new Error("HTTP 500"));
    await p;
    expect(t.onError).toHaveBeenCalledTimes(1);
    expect(t.onData).not.toHaveBeenCalled();
  });
});
