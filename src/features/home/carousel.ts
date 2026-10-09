export const TRENDING_PER_PAGE = 4;

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** Wraps around: past the last page goes to the first, before the first to the last. */
export function stepPage(page: number, delta: 1 | -1, pages: number): number {
  return (((page + delta) % pages) + pages) % pages;
}

export function pageItems<T>(
  items: readonly T[],
  page: number,
  perPage: number,
): T[] {
  return items.slice(page * perPage, page * perPage + perPage);
}
