import { describe, expect, it } from "vitest";
import { createFrameBatcher } from "./frame-batcher";
import type { MainToWorker } from "./messages";

type Posted = { msg: MainToWorker; transfer: Transferable[] };

function setup(capacity = 4) {
  const posted: Posted[] = [];
  const batcher = createFrameBatcher(capacity, (msg, transfer) =>
    posted.push({ msg, transfer }),
  );
  return { posted, batcher };
}

describe("createFrameBatcher", () => {
  it("does not post when empty", () => {
    const { posted, batcher } = setup();
    batcher.flush();
    expect(posted).toEqual([]);
  });

  it("posts frames with their buffers in the transfer list", () => {
    const { posted, batcher } = setup();
    batcher.push(16, true);
    batcher.push(20, false);
    batcher.flush();
    expect(posted).toHaveLength(1);
    const { msg, transfer } = posted[0];
    if (msg.type !== "frames") throw new Error("expected frames");
    expect(msg.len).toBe(2);
    expect(Array.from(msg.buf.slice(0, 2))).toEqual([16, 20]);
    expect(Array.from(msg.flags.slice(0, 2))).toEqual([1, 0]);
    expect(transfer).toEqual([msg.buf.buffer, msg.flags.buffer]);
  });

  it("replaces buffers after a flush so transferred memory is never reused", () => {
    const { posted, batcher } = setup();
    batcher.push(16, true);
    batcher.flush();
    batcher.push(33, true);
    batcher.flush();
    const [a, b] = posted.map((p) => p.msg);
    if (a.type !== "frames" || b.type !== "frames") throw new Error("frames");
    expect(a.buf).not.toBe(b.buf);
    expect(a.flags).not.toBe(b.flags);
    expect(b.buf[0]).toBe(33);
  });

  it("flushes automatically when the buffer is full", () => {
    const { posted, batcher } = setup(2);
    batcher.push(1, true);
    expect(posted).toHaveLength(0);
    batcher.push(2, true);
    expect(posted).toHaveLength(1);
    batcher.flush();
    expect(posted).toHaveLength(1);
  });
});
