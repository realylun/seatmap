import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_TICK_GAP_MS, pollWhileVisible } from "./poll";

/** document/window giả: chỉ cần visibilityState + event listener */
function fakePage(initial: DocumentVisibilityState = "visible") {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: initial,
  });
  const win = new EventTarget();
  const setVisibility = (state: DocumentVisibilityState) => {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  return { doc, win, setVisibility };
}

describe("pollWhileVisible", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ticks immediately then every interval while visible", () => {
    const { doc, win } = fakePage();
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 1000, doc, win);
    vi.advanceTimersByTime(0);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(5000);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it("pauses while hidden and refreshes immediately when visible again", () => {
    const { doc, win, setVisibility } = fakePage();
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 1000, doc, win);
    vi.advanceTimersByTime(0);
    setVisibility("hidden");
    vi.advanceTimersByTime(10_000);
    expect(tick).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    expect(tick).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(999);
    expect(tick).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does not tick at start or on focus while hidden", () => {
    const { doc, win, setVisibility } = fakePage("hidden");
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 1000, doc, win);
    win.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MIN_TICK_GAP_MS);
    win.dispatchEvent(new Event("focus"));
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
    setVisibility("hidden");
    setVisibility("visible");
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("debounces focus right after a visibility tick and flags resumed ticks", () => {
    const { doc, win, setVisibility } = fakePage();
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 15_000, doc, win);
    vi.advanceTimersByTime(0);
    expect(tick).toHaveBeenLastCalledWith({ resumed: false });
    setVisibility("hidden");
    vi.advanceTimersByTime(5000);
    setVisibility("visible");
    win.dispatchEvent(new Event("focus"));
    expect(tick).toHaveBeenCalledTimes(2);
    expect(tick).toHaveBeenLastCalledWith({ resumed: true });
    vi.advanceTimersByTime(MIN_TICK_GAP_MS);
    win.dispatchEvent(new Event("focus"));
    expect(tick).toHaveBeenCalledTimes(3);
    expect(tick).toHaveBeenLastCalledWith({ resumed: false });
    stop();
  });
});
