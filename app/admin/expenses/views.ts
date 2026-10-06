import { parsePage } from "@/lib/pagination";
import { TRIP_VIEWS, type TripView } from "@/lib/expenses/trips";

export const TRIP_TABS: { id: TripView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "ongoing", label: "On trip" },
  { id: "completed", label: "Completed" },
  { id: "due", label: "Payment due" },
  { id: "cancelled", label: "Cancelled" },
];

export type TripListView = { view: TripView; q: string; page: number };

/** Bookings page state from the URL: tab, search text (searches every booking) and page number */
export function parseTripView(params: URLSearchParams): TripListView {
  const view = params.get("view");
  return {
    view: TRIP_VIEWS.find((v) => v === view) ?? "all",
    q: (params.get("q") ?? "").trim().slice(0, 60),
    page: parsePage(params.get("page")),
  };
}

export function tripsHref(view: TripView, { q = "", page = 1 }: { q?: string; page?: number } = {}): string {
  const params = new URLSearchParams(q ? { q } : view === "all" ? {} : { view });
  if (page > 1) params.set("page", String(page));
  return `/admin/expenses/bookings${params.size ? `?${params}` : ""}`;
}
