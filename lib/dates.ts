// All booking dates are plain calendar days ("YYYY-MM-DD") in Indian time.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && toUtc(value).toISOString().startsWith(value);
}

export function todayIST(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function weekday(iso: string): number {
  return toUtc(iso).getUTCDay();
}

/** "Mon, 12 Oct" */
export function fmtShort(iso: string): string {
  const d = toUtc(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "12 Oct" */
export function fmtDayMonth(iso: string): string {
  const d = toUtc(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "12 Oct 2026" */
export function fmtLong(iso: string): string {
  return `${fmtDayMonth(iso)} ${iso.slice(0, 4)}`;
}

/** "12 Oct – 13 Oct 2026", or "12 Oct 2026" for a single day */
export function fmtRange(start: string, end: string): string {
  if (start === end) return fmtLong(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? fmtDayMonth(start) : fmtLong(start)} – ${fmtLong(end)}`;
}

/** "12–13 Oct" or "30 Oct–1 Nov" (compact, for WhatsApp list rows) */
export function fmtRangeCompact(start: string, end: string): string {
  if (start === end) return fmtDayMonth(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${toUtc(start).getUTCDate()}–${fmtDayMonth(end)}`;
  return `${fmtDayMonth(start)}–${fmtDayMonth(end)}`;
}

export function daysText(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}
