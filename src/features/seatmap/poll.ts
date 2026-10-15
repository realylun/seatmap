type VisibilityDoc = EventTarget & {
  readonly visibilityState: DocumentVisibilityState;
};

/** visibilitychange + focus thường bắn liền nhau khi quay lại tab → gộp tick trong khoảng này */
export const MIN_TICK_GAP_MS = 1000;

export type PollTick = (info: { readonly resumed: boolean }) => void;

/**
 * Gọi `tick` ngay rồi mỗi `intervalMs`, chỉ khi tab đang hiển thị: tab ẩn → dừng interval;
 * hiện lại → tick ngay với `resumed: true` và chạy lại interval. Window focus (tab đang hiện)
 * → tick ngay, trừ khi vừa tick trong MIN_TICK_GAP_MS. Trả về hàm dừng.
 */
export function pollWhileVisible(
  tick: PollTick,
  intervalMs: number,
  doc: VisibilityDoc = document,
  win: EventTarget = window,
): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastTick = -Infinity;
  const isVisible = () => doc.visibilityState === "visible";
  const fire = (resumed: boolean) => {
    lastTick = Date.now();
    tick({ resumed });
  };
  const stopTimer = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const restart = (resumed: boolean) => {
    stopTimer();
    if (resumed || Date.now() - lastTick >= MIN_TICK_GAP_MS) fire(resumed);
    timer = setInterval(() => {
      if (isVisible()) fire(false);
    }, intervalMs);
  };
  const onVisibility = () => (isVisible() ? restart(true) : stopTimer());
  const onFocus = () => {
    if (isVisible()) restart(false);
  };

  const first = setTimeout(() => {
    if (isVisible()) restart(false);
  }, 0);
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("focus", onFocus);
  return () => {
    clearTimeout(first);
    stopTimer();
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("focus", onFocus);
  };
}
