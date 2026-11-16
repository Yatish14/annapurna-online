import { tripsHref } from "@/app/admin/expenses/views";
import { fmtShort } from "@/lib/dates";
import { formatRupees } from "@/lib/expenses/money";
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

/** "not set yet" → "Not set yet" (the tool writes values for the model; the card starts them with a capital) */
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type ReadyBooking = {
  ready: boolean;
  booking: Record<"customer" | "phone" | "vehicle" | "driver" | "dates" | "route" | "total" | "advance" | "driver_amount", string> & {
    notes: string | null;
  };
  driver_busy: string | null;
  /** The row in assistant_drafts (4.5): the only thing about the draft that goes to the browser and comes back */
  draft_id: string;
};

type ReadyPayment = {
  ready: boolean;
  payment: Record<"booking" | "who" | "amount" | "method" | "when" | "after", string> & { note: string | null };
  warning: string | null;
  draft_id: string;
};

type ReadyFuel = {
  ready: boolean;
  fuel: Record<"for" | "vehicle" | "amount" | "litres" | "when", string> & { note: string | null };
  warning: string | null;
  draft_id: string;
  page: string;
};

const CARDS: Record<string, (args: Args, result: ToolResult<unknown>) => Card | null> = {
  // A fuel fill ready to confirm (4.10)
  draft_fuel: (_args, result) => {
    const { ready, fuel: f, warning, draft_id, page } = result.data as ReadyFuel;
    if (!ready) return null;
    return {
      kind: "draft",
      id: draft_id,
      title: "Fuel",
      icon: "fuel",
      status: "pending",
      formHref: page,
      formLabel: page.includes("/bookings/") ? "Open the booking" : "Open the vehicle",
      fields: [
        { label: "For", value: f.for },
        { label: "Vehicle", value: f.vehicle },
        { label: "Amount", value: f.amount },
        { label: "Litres", value: capital(f.litres) },
        { label: "When", value: f.when },
        ...(f.note ? [{ label: "Note", value: f.note }] : []),
      ],
      warning: warning ?? undefined,
    };
  },
  // A payment ready to confirm (4.9): the same card as a booking, with the payment's checked values
  draft_payment: (args, result) => {
    const { ready, payment: p, warning, draft_id } = result.data as ReadyPayment;
    if (!ready) return null;
    const driver = args.party === "driver";
    const tripNo = p.booking.split(" · ")[0];
    return {
      kind: "draft",
      id: draft_id,
      title: driver ? "Payment to the driver" : "Payment received",
      icon: "rupee",
      status: "pending",
      // The booking's page, where its payments are: there's no separate payment form to fill in
      formHref: `/admin/expenses/bookings/${tripNo}#${driver ? "driver-payments" : "customer-payments"}`,
      formLabel: "Open the booking",
      fields: [
        { label: "Booking", value: p.booking },
        { label: driver ? "To" : "From", value: p.who },
        { label: "Amount", value: `${p.amount} · ${p.method}` },
        { label: "When", value: p.when },
        ...(p.note ? [{ label: "Note", value: p.note }] : []),
        { label: "After this", value: capital(p.after) },
      ],
      warning: warning ?? undefined,
    };
  },
  // A booking ready to confirm (4.4). The card shows the checked values from the tool, not the model's words.
  // The card shows the details, but carries only the draft's id: Confirm (4.6) loads the values from the server.
  draft_booking: (_args, result) => {
    const { ready, booking: b, driver_busy, draft_id } = result.data as ReadyBooking;
    if (!ready) return null;
    return {
      kind: "draft",
      id: draft_id,
      title: "New booking",
      icon: "bookings",
      status: "pending",
      // Only the id: the form page loads the values from the server, for this admin (4.8)
      formHref: `/admin/expenses/bookings/new?draft=${draft_id}`,
      fields: [
        { label: "Customer", value: `${b.customer} · ${b.phone}` },
        { label: "Route", value: b.route },
        { label: "Dates", value: b.dates },
        { label: "Vehicle", value: b.vehicle },
        { label: "Driver", value: b.driver },
        { label: "Total", value: capital(b.total) },
        { label: "Advance", value: capital(b.advance) },
        { label: "Driver's pay", value: capital(b.driver_amount) },
        ...(b.notes ? [{ label: "Notes", value: b.notes }] : []),
      ],
      warning: driver_busy ? `${driver_busy} You said to book them anyway.` : undefined,
    };
  },
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
  // The report's PDF, with the same file name and link as the Reports page's "Download PDF" button
  report: (_args, result) => {
    const { title, reports, pdf, page } = result.data as {
      title: string;
      reports: { lists: string }[];
      pdf: { file: string; url: string };
      page: string;
    };
    return {
      kind: "file",
      name: pdf.file, // "annapurna-drivers-report-Oct-2026.pdf"
      detail: `${title} · ${reports.map((r) => r.lists).join(", ")}`, // "Drivers report · October 2026 · 3 drivers"
      href: pdf.url,
      view: page,
    };
  },
  // A booking's expense statement, with the same file name and link as the booking page's button
  expense_statement: (_args, result) => {
    const s = result.data as { no: string; customer: string; total: number; received: number; balance: number; file: string; url: string; page: string };
    const owes = s.balance > 0 ? `${formatRupees(s.balance)} to pay` : "fully paid";
    return {
      kind: "file",
      name: s.file, // "expense-statement-VB-0012.pdf"
      detail: `For ${s.customer} · total ${formatRupees(s.total)}, paid ${formatRupees(s.received)}, ${owes}`,
      href: s.url,
      view: s.page,
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
