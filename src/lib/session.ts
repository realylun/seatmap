// Cookie ẩn danh `sid` xác định chủ sở hữu hold/order (POC không có auth).
// Chỉ ghi được trong Server Action / Route Handler; Server Component chỉ đọc.
import { cookies } from "next/headers";
import { z } from "zod";

export const SESSION_COOKIE = "sid";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** sid hợp lệ của request hiện tại, hoặc null */
export async function readSessionId(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Đọc sid, tạo mới nếu chưa có. Chỉ gọi trong Server Action. */
export async function ensureSessionId(): Promise<string> {
  const existing = await readSessionId();
  if (existing) return existing;
  const sid = crypto.randomUUID();
  (await cookies()).set(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return sid;
}
