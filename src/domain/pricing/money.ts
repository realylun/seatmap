// Tiền VND luôn là số nguyên (không có xu). Format tay thay vì Intl để output ổn định giữa
// server/client (Intl vi-VN chèn NBSP, khác nhau theo ICU) → tránh hydration mismatch.
const GROUP = /\B(?=(\d{3})+(?!\d))/g;

export function formatVnd(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Số tiền VND phải là số nguyên: ${amount}`);
  }
  const digits = String(Math.abs(amount)).replace(GROUP, ".");
  return `${amount < 0 ? "-" : ""}${digits} ₫`;
}
