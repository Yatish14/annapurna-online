import { fmtLong, fmtRangeCompact, MONTHS_LONG } from "../dates";
import { formatPhone } from "../format";
import { formatNumber, formatRupees } from "./money";
import { vehicleProfit, vehiclesMonth } from "./overview";
import {
  balanceOf,
  driversMonth,
  EXPENSE_LABELS,
  expensesIn,
  kmOf,
  profitOf,
  profitWhenPaid,
  tripsStartingIn,
  type Expense,
  type Trip,
} from "./trips";

export const monthLabel = (month: string) => `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** The month as file names show it: 2026-10 → Oct-2026 */
const fileMonth = (month: string) => `${MONTHS_LONG[Number(month.slice(5)) - 1].slice(0, 3)}-${month.slice(0, 4)}`;

/** The tabs of the Reports page; each can be downloaded as a PDF */
export const REPORT_TABS = ["bookings", "customers", "drivers", "vehicles"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];
export const isReportTab = (v: unknown): v is ReportTab => REPORT_TABS.includes(v as ReportTab);
export const REPORT_TITLES: Record<ReportTab, string> = {
  bookings: "Bookings report",
  customers: "Customers report",
  drivers: "Drivers report",
  vehicles: "Vehicles report",
};

/** annapurna-bookings-report-Oct-2026.pdf */
export const pdfName = (tab: ReportTab, month: string) => `annapurna-${tab}-report-${fileMonth(month)}.pdf`;

/** A table cell: text, an amount or count, or nothing ("—") */
export type Cell = string | number | null;

export type Column = {
  label: string;
  /** Amounts show as ₹, counts as plain numbers; both right-aligned */
  kind: "text" | "money" | "number";
  /** Share of the PDF page width */
  width: number;
  /** profit: red below zero, green above; due: red when anything is owed */
  tone?: "profit" | "due";
};

export type Row = { cells: Cell[]; /** Where the first cell links to on the website */ href?: string };

export type Section = { title: string; columns: Column[]; rows: Row[]; total?: Cell[]; empty: string };

export type Tile = {
  label: string;
  value: number;
  money: boolean;
  sub?: string;
  tone: "navy" | "green" | "red" | "gold" | "plum";
};

/** One report, as both the Reports page and its PDF show it */
export type Report = {
  tab: ReportTab;
  title: string;
  month: string;
  tiles: Tile[];
  sections: Section[];
  notes: string[];
  /** What it lists, for the activity log: "9 bookings" */
  contents: string;
};

/** A cell as text: amounts in ₹, counts with commas, an empty value as "—" (blank in a totals row) */
export function cellText(value: Cell, column: Column): string {
  if (value === "") return "";
  if (value === null) return "—";
  if (typeof value === "number") return column.kind === "money" ? formatRupees(value) : formatNumber(value);
  return value;
}

/** neg (red) for a loss or money owed, pos (green) for a profit */
export function cellTone(value: Cell, column: Column): "neg" | "pos" | null {
  if (typeof value !== "number") return null;
  if (column.tone === "profit") return value < 0 ? "neg" : value > 0 ? "pos" : null;
  if (column.tone === "due") return value > 0 ? "neg" : null;
  return null;
}

const sum = <T>(items: T[], pick: (item: T) => number | null) => items.reduce((acc, item) => acc + (pick(item) ?? 0), 0);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const money = (label: string, width = 7, tone?: Column["tone"]): Column => ({ label, kind: "money", width, tone });
const count = (label: string, width = 5): Column => ({ label, kind: "number", width });
const text = (label: string, width: number): Column => ({ label, kind: "text", width });

// ---------- Vehicle costs: repairs, FASTag, EMI and insurance ----------

const VEHICLE_COSTS = new Set(["repair", "fastag", "emi", "insurance"]);

/** The vehicles' own costs paid in the month (not removed), by date */
async function vehicleCosts(month: string): Promise<Expense[]> {
  return (await expensesIn(month)).filter((e) => VEHICLE_COSTS.has(e.kind) && !e.deleted_ist);
}

/** What a vehicle cost entry was, in a few words */
function costDetails(e: Expense): string {
  const period = e.period ? `For ${monthLabel(e.period)}` : null;
  const parts =
    e.kind === "repair" ? [e.description, e.shop_name, e.shop_city] : e.kind === "emi" ? [period, e.description] : [e.description];
  return parts.filter(Boolean).join(" · ") || "—";
}

/** Each repair, FASTag recharge, EMI and insurance payment of the month */
function vehicleCostsSection(costs: Expense[], month: string): Section {
  return {
    title: `Repairs, FASTag, EMI and insurance in ${monthLabel(month)}`,
    columns: [text("Date", 7), text("Vehicle", 11), text("Cost", 8), text("Details", 30), money("Amount")],
    rows: costs.map((e) => ({
      cells: [fmtLong(e.spent_on), e.vehicle_name, e.kind === "fastag" ? "FASTag recharge" : EXPENSE_LABELS[e.kind], costDetails(e), e.amount],
    })),
    total: ["Total", "", "", "", sum(costs, (e) => e.amount)],
    empty: `No repairs, FASTag recharges, EMI or insurance in ${monthLabel(month)}.`,
  };
}

// ---------- Bookings ----------

/** Where the booking went, city only: a round trip's destination, otherwise the drop city */
const wentTo = (t: Trip) => (t.round_trip ? t.dest_city : t.drop_city);

/** Every booking starting in the month with its amounts, costs and profit; then the vehicles' own costs and the total profit */
async function bookingsReport(month: string): Promise<Report> {
  const [trips, costs] = await Promise.all([tripsStartingIn(month), vehicleCosts(month)]);
  const costOf = (kind: Expense["kind"]) => sum(costs.filter((e) => e.kind === kind), (e) => e.amount);
  const repairs = costOf("repair");
  const fastag = costOf("fastag");
  const emi = costOf("emi");
  const insurance = costOf("insurance");
  const booked = trips.filter((t) => t.status === "booked");
  const cancelled = trips.length - booked.length;
  const profit = sum(booked, profitOf);
  const whenPaid = sum(booked, profitWhenPaid);
  const due = sum(booked, balanceOf);
  const km = sum(booked, kmOf);
  const totalProfit = profit - repairs - fastag - emi - insurance;

  return {
    tab: "bookings",
    title: REPORT_TITLES.bookings,
    month,
    tiles: [
      { label: "Bookings", value: booked.length, money: false, sub: km ? `${km.toLocaleString("en-IN")} km` : undefined, tone: "navy" },
      { label: "Billed", value: sum(booked, (t) => t.total_amount), money: true, tone: "navy" },
      { label: "Received", value: sum(booked, (t) => t.received), money: true, tone: "green" },
      { label: "Balance due", value: due, money: true, tone: due > 0 ? "red" : "green" },
      { label: "Driver pay", value: sum(booked, (t) => t.driver_amount), money: true, tone: "plum" },
      { label: "Fuel", value: sum(booked, (t) => t.fuel), money: true, tone: "gold" },
      { label: "Other expenses", value: sum(booked, (t) => t.other), money: true, sub: "Tolls, parking…", tone: "gold" },
      {
        label: "Bookings profit",
        value: profit,
        money: true,
        sub: whenPaid !== profit ? `${formatRupees(whenPaid)} once fully paid` : undefined,
        tone: profit < 0 ? "red" : "green",
      },
      { label: "Repairs", value: repairs, money: true, tone: "gold" },
      { label: "FASTag", value: fastag, money: true, tone: "gold" },
      { label: "EMI & insurance", value: emi + insurance, money: true, tone: "gold" },
      { label: "Total profit", value: totalProfit, money: true, sub: "After every cost", tone: totalProfit < 0 ? "red" : "green" },
    ],
    sections: [
      {
        title: `Bookings starting in ${monthLabel(month)}`,
        columns: [
          text("Booking", 6),
          text("Dates", 7),
          text("Customer", 10),
          text("To", 12.5),
          text("Vehicle", 9),
          text("Driver", 9.5),
          count("Km"),
          money("Total"),
          money("Received"),
          money("Balance", 7, "due"),
          money("Driver pay"),
          money("Fuel", 6),
          money("Other", 6),
          money("Profit", 7, "profit"),
        ],
        rows: booked.map((t) => ({
          href: `/admin/expenses/bookings/${t.trip_no}`,
          cells: [
            t.trip_no, fmtRangeCompact(t.start_date, t.end_date), t.customer_name, wentTo(t), t.vehicle_name, t.driver_name, kmOf(t),
            t.total_amount, t.received, balanceOf(t), t.driver_amount, t.fuel, t.other, profitOf(t),
          ],
        })),
        total: [
          "Total", "", "", "", "", "", km, sum(booked, (t) => t.total_amount), sum(booked, (t) => t.received), due,
          sum(booked, (t) => t.driver_amount), sum(booked, (t) => t.fuel), sum(booked, (t) => t.other), profit,
        ],
        empty: `No bookings start in ${monthLabel(month)}.`,
      },
      vehicleCostsSection(costs, month),
      {
        title: `Total profit for ${monthLabel(month)}`,
        columns: [text("", 30), money("Amount", 7, "profit")],
        rows: [
          { cells: ["Profit from the bookings (received − driver pay − fuel − other expenses)", profit] },
          { cells: ["Repairs", -repairs] },
          { cells: ["FASTag recharges", -fastag] },
          { cells: ["EMI", -emi] },
          { cells: ["Insurance", -insurance] },
        ],
        total: ["Total profit", totalProfit],
        empty: "",
      },
    ],
    notes: [
      "Bookings profit = received from the customer − driver pay − fuel − other expenses (tolls, parking…), for bookings starting in the month.",
      "Total profit = bookings profit − repairs − FASTag − EMI − insurance. Repairs, FASTag, EMI and insurance count in the month of the date entered on them (an EMI paid on 5 Oct counts in October).",
      ...(cancelled ? [`${plural(cancelled, "cancelled booking")} ${cancelled === 1 ? "isn't" : "aren't"} listed or counted.`] : []),
    ],
    contents: `${plural(booked.length, "booking")}, ${plural(costs.length, "vehicle cost")}`,
  };
}

// ---------- Customers ----------

/** For each customer (by mobile number): their bookings starting in the month, what they were billed, have paid and still owe */
async function customersReport(month: string): Promise<Report> {
  const booked = (await tripsStartingIn(month)).filter((t) => t.status === "booked");
  const byPhone = new Map<string, Trip[]>();
  for (const t of booked) byPhone.set(t.customer_phone, [...(byPhone.get(t.customer_phone) ?? []), t]);
  const customers = [...byPhone].map(([phone, trips]) => ({
    phone,
    // The name on their latest booking
    name: trips[trips.length - 1].customer_name,
    bookings: trips.length,
    billed: sum(trips, (t) => t.total_amount),
    paid: sum(trips, (t) => t.received),
    owes: sum(trips, balanceOf),
  }));
  // Who owes the most first, then by name
  customers.sort((a, b) => b.owes - a.owes || a.name.localeCompare(b.name));
  const billed = sum(customers, (c) => c.billed);
  const paid = sum(customers, (c) => c.paid);
  const owes = sum(customers, (c) => c.owes);
  const owing = customers.filter((c) => c.owes > 0).length;

  return {
    tab: "customers",
    title: REPORT_TITLES.customers,
    month,
    tiles: [
      { label: "Customers", value: customers.length, money: false, sub: plural(booked.length, "booking"), tone: "navy" },
      { label: "Billed", value: billed, money: true, tone: "navy" },
      { label: "Paid", value: paid, money: true, tone: "green" },
      { label: "Still to pay us", value: owes, money: true, sub: owing ? `${plural(owing, "customer")} owe${owing === 1 ? "s" : ""}` : "All paid", tone: owes > 0 ? "red" : "green" },
    ],
    sections: [
      {
        title: `Customers in ${monthLabel(month)}`,
        columns: [
          text("Customer", 14),
          text("Mobile", 9),
          count("Bookings", 6),
          money("Billed", 8),
          money("Paid", 8),
          money("Still to pay us", 9, "due"),
        ],
        rows: customers.map((c) => ({
          href: `/admin/expenses/bookings?q=${c.phone}`,
          cells: [c.name, formatPhone(c.phone), c.bookings, c.billed, c.paid, c.owes],
        })),
        total: ["Total", "", booked.length, billed, paid, owes],
        empty: `No bookings start in ${monthLabel(month)}.`,
      },
    ],
    notes: [
      `For the bookings starting in ${monthLabel(month)}: what each customer was billed, what they have paid so far and what they still have to pay us. Customers are matched by mobile number.`,
    ],
    contents: plural(customers.length, "customer"),
  };
}

// ---------- Drivers ----------

/** For each driver: their bookings in the month, what we agreed to pay, what we have paid and what we still have to pay */
async function driversReport(month: string): Promise<Report> {
  const drivers = await driversMonth(month);
  const agreed = sum(drivers, (d) => d.earned);
  const paid = sum(drivers, (d) => d.paidForMonth);
  const owed = sum(drivers, (d) => d.owedForMonth);
  const bookings = sum(drivers, (d) => d.bookings);

  return {
    tab: "drivers",
    title: REPORT_TITLES.drivers,
    month,
    tiles: [
      { label: "Drivers", value: drivers.length, money: false, sub: plural(bookings, "booking"), tone: "navy" },
      { label: "Pay agreed", value: agreed, money: true, tone: "plum" },
      { label: "Paid", value: paid, money: true, tone: "green" },
      { label: "Still to pay", value: owed, money: true, tone: owed > 0 ? "red" : "green" },
    ],
    sections: [
      {
        title: `Drivers in ${monthLabel(month)}`,
        columns: [
          text("Driver", 12),
          text("Mobile", 9),
          count("Bookings", 6),
          count("Days", 5),
          money("Pay agreed", 8),
          money("Paid", 8),
          money("Still to pay", 8, "due"),
        ],
        rows: drivers.map((d) => ({
          href: `/admin/expenses/fleet/drivers/${d.id}`,
          cells: [
            d.active ? d.name : `${d.name} (switched off)`, formatPhone(d.phone), d.bookings, d.days, d.earned, d.paidForMonth, d.owedForMonth,
          ],
        })),
        total: ["Total", "", bookings, sum(drivers, (d) => d.days), agreed, paid, owed],
        empty: "No drivers yet.",
      },
    ],
    notes: [
      `For the bookings starting in ${monthLabel(month)}: the pay agreed with each driver, what we have paid them so far and what we still have to pay.`,
    ],
    contents: plural(drivers.length, "driver"),
  };
}

// ---------- Vehicles ----------

/** Each vehicle's money for the month (bookings, every cost, profit) and the vehicle's own costs one by one */
async function vehiclesReport(month: string): Promise<Report> {
  const [vehicles, costs] = await Promise.all([vehiclesMonth(month), vehicleCosts(month)]);
  const profit = sum(vehicles, vehicleProfit);
  const total = (pick: (v: (typeof vehicles)[number]) => number) => sum(vehicles, pick);

  return {
    tab: "vehicles",
    title: REPORT_TITLES.vehicles,
    month,
    tiles: [
      { label: "Received", value: total((v) => v.received), money: true, sub: plural(total((v) => v.bookings), "booking"), tone: "green" },
      { label: "Driver pay", value: total((v) => v.driverAmount), money: true, tone: "plum" },
      { label: "Fuel", value: total((v) => v.fuel), money: true, tone: "gold" },
      { label: "Tolls & other", value: total((v) => v.other), money: true, tone: "gold" },
      { label: "Repairs", value: total((v) => v.repairs), money: true, tone: "gold" },
      { label: "FASTag", value: total((v) => v.fastag), money: true, tone: "gold" },
      { label: "EMI & insurance", value: total((v) => v.emi + v.insurance), money: true, tone: "gold" },
      { label: "Profit", value: profit, money: true, sub: plural(vehicles.length, "vehicle"), tone: profit < 0 ? "red" : "green" },
    ],
    sections: [
      {
        title: `Vehicles in ${monthLabel(month)}`,
        columns: [
          text("Vehicle", 11),
          count("Bookings", 5.5),
          count("Km"),
          money("Billed"),
          money("Received"),
          money("Driver pay"),
          money("Fuel", 6),
          money("Other", 6),
          money("Repairs", 6),
          money("FASTag", 6),
          money("EMI", 6),
          money("Insurance", 6.5),
          money("Profit", 7, "profit"),
        ],
        rows: vehicles.map((v) => ({
          href: `/admin/expenses/fleet/${v.id}`,
          cells: [
            v.active ? v.name : `${v.name} (switched off)`, v.bookings, v.km, v.billed, v.received, v.driverAmount, v.fuel, v.other,
            v.repairs, v.fastag, v.emi, v.insurance, vehicleProfit(v),
          ],
        })),
        total: [
          "Total", total((v) => v.bookings), total((v) => v.km), total((v) => v.billed), total((v) => v.received),
          total((v) => v.driverAmount), total((v) => v.fuel), total((v) => v.other), total((v) => v.repairs), total((v) => v.fastag),
          total((v) => v.emi), total((v) => v.insurance), profit,
        ],
        empty: "No vehicles yet.",
      },
      vehicleCostsSection(costs, month),
    ],
    notes: [
      "Profit = received − driver pay − fuel − other booking expenses − repairs − FASTag − EMI − insurance.",
      "Billed, received, driver pay, fuel and other expenses are for the bookings starting in the month (received = paid so far), as in the Bookings report. Repairs, FASTag, EMI and insurance count in the month of the date entered on them.",
    ],
    contents: `${plural(vehicles.length, "vehicle")}, ${plural(costs.length, "cost")}`,
  };
}

const BUILDERS: Record<ReportTab, (month: string) => Promise<Report>> = {
  bookings: bookingsReport,
  customers: customersReport,
  drivers: driversReport,
  vehicles: vehiclesReport,
};

export function buildReport(tab: ReportTab, month: string): Promise<Report> {
  return BUILDERS[tab](month);
}
