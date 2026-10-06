/** Rows per page on the paginated dashboard lists (print orders, activity) */
export const PAGE_SIZE = 10;

/** ?page=… → a page number from 1 (anything invalid is page 1) */
export function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : 1;
}

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type PageItem = number | "gap";

/**
 * The page buttons to show, always the same number of slots so the row never grows:
 * with `siblings` = 1 (7 slots):  1 2 3 4 5 … 100 · 1 … 66 67 68 … 100 · 1 … 96 97 98 99 100
 * with `siblings` = 0 (5 slots):  1 2 3 … 100 · 1 … 67 … 100 · 1 … 98 99 100
 */
export function pageItems(current: number, total: number, siblings = 1): PageItem[] {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const slots = siblings * 2 + 5; // first, last, current, siblings, two gaps
  if (total <= slots) return range(1, total);

  const page = Math.min(Math.max(current, 1), total);
  const left = page - siblings;
  const right = page + siblings;
  const edge = siblings * 2 + 3; // pages shown next to the first or last page when there's only one gap

  if (left <= 3) return [...range(1, edge), "gap", total];
  if (right >= total - 2) return [1, "gap", ...range(total - edge + 1, total)];
  return [1, "gap", ...range(left, right), "gap", total];
}
