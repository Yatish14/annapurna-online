import { tripsHref } from "@/app/admin/expenses/views";
import { fmtShort } from "@/lib/dates";
import { TRIP_VIEWS, type TripView } from "@/lib/expenses/trips";
import type { ToolResult } from "./tools/result";
import type { BookingRow, Card } from "./types";

/**
 * Cards under an answer, made from a tool's own result (its artifact, which never goes to the model). So a table's
 * numbers come straight from the database, not from the model's words: if the model miscounts or garbles a
 * number, the card is still right. In privacy-first mode (Step 9) cards are how the admin sees the data at all.
 * Tools without a card here just don't get one.
 */

type Args = Record<string, unknown>;
type Rows = { total: number; bookings: BookingRow[] };

const TAB_NAMES: Record<TripView, string> = {
  all: "All bookings",
  upcoming: "Upcoming bookings",
  ongoing: "Bookings on the road",
  completed: "Completed bookings",
  due: "Bookings with payment due",
  cancelled: "Cancelled bookings",
};

/** "3 bookings" or, when the list is cut, "20 of 57" */
const counted = (title: string, shown: number, total: number) => `${title} (${shown < total ? `${shown} of ${total}` : total})`;

/** Only the six columns the table shows; anything else in the row stays out of the browser's copy */
const tableRows = (rows: BookingRow[]): BookingRow[] =>
  rows.map(({ no, customer, vehicle, driver, dates, balance }) => ({ no, customer, vehicle, driver, dates, balance }));

const CARDS: Record<string, (args: Args, result: ToolResult<unknown>) => Card | null> = {
  list_bookings: (args, result) => {
    const { total, bookings } = result.data as Rows;
    if (!bookings.length) return null;
    const view = TRIP_VIEWS.find((v) => v === args.status) ?? "all";
    const from = typeof args.from === "string" ? args.from : null;
    const to = typeof args.to === "string" ? args.to : from;
    const when = from ? ` · ${from === to ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to!)}`}` : "";
    return {
      kind: "bookings",
      title: counted(`${TAB_NAMES[view]}${when}`, bookings.length, total),
      rows: tableRows(bookings),
      link: { href: tripsHref(view), label: "Open in Bookings" },
    };
  },
  search_bookings: (args, result) => {
    const { total, bookings } = result.data as Rows;
    if (!bookings.length) return null;
    const query = typeof args.query === "string" ? args.query : "";
    return {
      kind: "bookings",
      title: counted(`Bookings matching "${query}"`, bookings.length, total),
      rows: tableRows(bookings),
      link: { href: tripsHref("all", { q: query }), label: "See in Bookings" },
    };
  },
  balances_due: (_args, result) => {
    const { customer_bookings, bookings_owing } = result.data as { customer_bookings: number; bookings_owing: BookingRow[] };
    if (!bookings_owing.length) return null;
    return {
      kind: "bookings",
      title: counted("Customers who still owe", bookings_owing.length, customer_bookings),
      rows: tableRows(bookings_owing),
      link: { href: tripsHref("due"), label: "Open Payment due" },
    };
  },
};

/** The card for one finished tool call, or null. Never throws: a broken card mustn't break the answer. */
export function cardFor(tool: string, args: Args, artifact: unknown): Card | null {
  const result = artifact as ToolResult<unknown> | undefined;
  if (!result || result.status === "failed" || result.status === "none" || !result.data) return null;
  try {
    return CARDS[tool]?.(args, result) ?? null;
  } catch (err) {
    console.error(`Annapurna Assist: couldn't make a card for ${tool}`, err);
    return null;
  }
}
