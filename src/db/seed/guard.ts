// Seed xoá sạch database → chỉ chạy thẳng trên máy local; host khác phải xác nhận đúng tên host.
// Không dựa vào NODE_ENV (tsx không đặt biến này).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function databaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch (cause) {
    throw new Error("DATABASE_URL không phải URL hợp lệ", { cause });
  }
}

/** Throw nếu không được phép xoá database tại `databaseUrl` */
export function assertSeedAllowed(
  databaseUrl: string,
  confirm: string | undefined,
): void {
  const host = databaseHost(databaseUrl);
  if (LOCAL_HOSTS.has(host) || confirm === host) return;
  throw new Error(`Refusing to wipe ${host}; set SEED_CONFIRM=${host}`);
}
