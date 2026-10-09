import { describe, expect, it } from "vitest";
import { assertSeedAllowed, databaseHost } from "./guard";

const NEON =
  "postgresql://u:p@ep-cool-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("assertSeedAllowed", () => {
  it.each([
    "postgres://u:p@localhost:5432/db",
    "postgres://127.0.0.1/db",
    "postgres://[::1]:5432/db",
  ])("host local %s → cho phép không cần xác nhận", (url) => {
    expect(() => assertSeedAllowed(url, undefined)).not.toThrow();
  });

  it("host từ xa không xác nhận → từ chối, chỉ đúng host", () => {
    expect(() => assertSeedAllowed(NEON, undefined)).toThrow(
      "Refusing to wipe ep-cool-123.ap-southeast-1.aws.neon.tech; set SEED_CONFIRM=ep-cool-123.ap-southeast-1.aws.neon.tech",
    );
    expect(() => assertSeedAllowed(NEON, "1")).toThrow(/Refusing to wipe/);
    expect(() => assertSeedAllowed(NEON, "ep-other.aws.neon.tech")).toThrow(
      /Refusing to wipe/,
    );
  });

  it("SEED_CONFIRM đúng host → cho phép", () => {
    expect(() =>
      assertSeedAllowed(NEON, "ep-cool-123.ap-southeast-1.aws.neon.tech"),
    ).not.toThrow();
  });

  it("URL hỏng → lỗi rõ ràng", () => {
    expect(() => databaseHost("not a url")).toThrow(/DATABASE_URL/);
  });
});
