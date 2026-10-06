import { isCarId, type BookingStatus, type CarId } from "@/lib/config";
import { todayIST } from "@/lib/dates";
import type { PrintStatus } from "@/lib/print/orders";

export const STATUS_TABS: { id: BookingStatus | "all"; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Booked" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function readParams(searchParams: SearchParams): Promise<URLSearchParams> {
  const raw = await searchParams;
  return new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
}

// ---------- Bookings list ----------

export type BookingFilters = { status: BookingStatus | "all"; car: CarId | "all" };

export function parseBookingFilters(params: URLSearchParams): BookingFilters {
  const status = params.get("status");
  const car = params.get("car");
  return {
    status: STATUS_TABS.some((t) => t.id === status) ? (status as BookingFilters["status"]) : "pending",
    car: isCarId(car) ? car : "all",
  };
}

export function bookingsHref(current: BookingFilters, change: Partial<BookingFilters> = {}): string {
  return `/admin/cars/bookings?${new URLSearchParams({ ...current, ...change })}`;
}

// ---------- Calendar ----------

export function parseMonth(params: URLSearchParams): string {
  const month = params.get("month");
  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : todayIST().slice(0, 7);
}

export function calendarHref(month: string): string {
  return `/admin/cars/calendar?month=${month}`;
}

// ---------- Printout orders ----------

export const PRINT_TABS: { id: PrintStatus | "all"; label: string }[] = [
  { id: "new", label: "New" },
  { id: "printed", label: "Printed" },
  { id: "collected", label: "Collected" },
  { id: "all", label: "All" },
];

export function parsePrintStatus(params: URLSearchParams): PrintStatus | "all" {
  const status = params.get("status");
  return PRINT_TABS.find((t) => t.id === status)?.id ?? "new";
}

export function printHref(status: PrintStatus | "all"): string {
  return `/admin/print?status=${status}`;
}

// ---------- Returning from actions ----------

const DASHBOARD_PATHS = ["/admin/print", "/admin/cars", "/admin/cars/bookings", "/admin/cars/calendar", "/admin/users"];

/** A dashboard URL to return to after an action: known pages and validated filter keys only */
export function safeBack(raw: unknown): string {
  const [path, qs = ""] = String(raw ?? "").split("?");
  if (!DASHBOARD_PATHS.includes(path)) return "/admin/print";
  const params = new URLSearchParams(qs);
  const out = new URLSearchParams();
  if (path === "/admin/print") {
    if (params.has("status")) out.set("status", parsePrintStatus(params));
  } else {
    const f = parseBookingFilters(params);
    if (params.has("status")) out.set("status", f.status);
    if (params.has("car")) out.set("car", f.car);
    if (params.has("month")) out.set("month", parseMonth(params));
  }
  return out.size ? `${path}?${out}` : path;
}

export function withFlash(back: string, flash: string, detail?: string): string {
  const [path, qs = ""] = back.split("?");
  const params = new URLSearchParams(qs);
  params.set("flash", flash);
  if (detail) params.set("ref", detail);
  return `${path}?${params}`;
}
