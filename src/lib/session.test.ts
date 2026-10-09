import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestContext } from "@/test/next-mocks";

const ctx = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("next/headers", async () => {
  const { createRequestContext: create } = await import("@/test/next-mocks");
  const request = create();
  ctx.value = request;
  return { cookies: request.cookies, headers: request.headers };
});

const { ensureSessionId, readSessionId, SESSION_COOKIE } =
  await import("./session");
const request = ctx.value as ReturnType<typeof createRequestContext>;

const SID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";

beforeEach(() => request.reset());

describe("session", () => {
  it("reads only a valid uuid sid", async () => {
    expect(await readSessionId()).toBeNull();
    request.jar.set(SESSION_COOKIE, { value: "not-a-uuid" });
    expect(await readSessionId()).toBeNull();
    request.jar.set(SESSION_COOKIE, { value: SID });
    expect(await readSessionId()).toBe(SID);
  });

  it("keeps an existing sid", async () => {
    request.jar.set(SESSION_COOKIE, { value: SID });
    expect(await ensureSessionId()).toBe(SID);
    expect(request.jar.get(SESSION_COOKIE)?.options).toBeUndefined();
  });

  it("creates an httpOnly lax 30-day cookie when missing", async () => {
    const sid = await ensureSessionId();
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.jar.get(SESSION_COOKIE)).toEqual({
      value: sid,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      },
    });
  });
});
