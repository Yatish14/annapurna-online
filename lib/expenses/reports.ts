import type { CsvValue } from "../csv";
import { toXlsx, type RowStyle } from "../xlsx";
import { diffDays, MONTHS_LONG } from "../dates";
import { PAYMENT_METHODS } from "./money";
import {
  balanceOf,
  driverOwed,
  driversMonth,
  expensesIn,
  kmOf,
  otherExpensesForMonth,
  PAY_LABELS,
  payState,
  paymentsIn,
  PHASE_LABELS,
  profitOf,
  profitWhenPaid,
  routeText,
  tripsStartingIn,
  type DriverMonth,
  type Expense,
  type PaymentRow,
  type Trip,
} from "./trips";

export const monthLabel = (month: string) => `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** The month as file names show it: 2026-10 → Oct-2026 */
const fileMonth = (month: string) => `${MONTHS_LONG[Number(month.slice(5)) - 1].slice(0, 3)}-${month.slice(0, 4)}`;

/** The Excel file with all three reports: annapurna-reports-Oct-2026.xlsx */
export const workbookName = (month: string) => `annapurna-reports-${fileMonth(month)}.xlsx`;

/** The reports on the Reports page: each a CSV file, or all three as tabs of one Excel file */
export const REPORT_TYPES = ["bookings", "drivers", "repairs"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const isReportType = (v: unknown): v is ReportType => REPORT_TYPES.includes(v as ReportType);

export type Report = {
  type: ReportType;
  /** "Bookings report", "Drivers report"… */
  title: string;
  filename: string;
  rows: CsvValue[][];
  /** A few figures for the Reports page (amounts in rupees, or plain counts) */
  highlights: { label: string; value: number; money: boolean }[];
  /** What the file lists, for the Reports page and the activity log: "3 bookings, 5 payments" */
  contents: string;
};

/** Everything a month's reports are made from, read once */
export type MonthData = {
  month: string;
  trips: Trip[];
  /** Every payment made in the month (the drivers report uses the ones to drivers) */
  payments: PaymentRow[];
  repairs: Expense[];
  /** Other expenses (tolls, parking…) of the bookings starting in the month */
  otherExpenses: Expense[];
  drivers: DriverMonth[];
};

export async function loadMonth(month: string): Promise<MonthData> {
  const [trips, payments, repairs, otherExpenses, drivers] = await Promise.all([
    tripsStartingIn(month),
    paymentsIn(month),
    expensesIn(month, "repair"),
    otherExpensesForMonth(month),
    driversMonth(month),
  ]);
  return { month, trips, payments, repairs, otherExpenses, drivers };
}

const sum = <T>(items: T[], pick: (item: T) => number | null) => items.reduce((acc, item) => acc + (pick(item) ?? 0), 0);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const live = (trips: Trip[]) => trips.filter((t) => t.status === "booked");
const kept = <T extends { deleted_ist: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_ist);

function heading(title: string, month: string): CsvValue[][] {
  const downloaded = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date());
  return [[`Annapurna Online Services · Expense Tracker · ${title} for ${monthLabel(month)}`], [`Downloaded ${downloaded}`], []];
}

// ---------- Sections ----------

function bookingsSection(trips: Trip[], month: string): CsvValue[][] {
  const booked = live(trips);
  return [
    [`BOOKINGS starting in ${monthLabel(month)} (${plural(trips.length, "booking")})`],
    [
      "Booking no", "Status", "Start date", "End date", "Days", "Customer", "Customer mobile",
      "Vehicle", "Driver", "Driver mobile", "Pickup city", "Pickup state", "Drop city", "Drop state",
      "Round trip", "Went to (city)", "Went to (state)", "Referred by", "Referrer mobile",
      "Odometer start", "Odometer end", "Km", "Total (Rs)", "Received (Rs)", "Balance due (Rs)", "Payment status",
      "Driver amount (Rs)", "Paid to driver (Rs)", "Driver still to pay (Rs)", "Fuel (Rs)", "Other expenses (Rs)", "Profit (Rs)",
      "Profit when fully paid (Rs)", "Notes", "Created by", "Created at",
    ],
    ...trips.map((t) => [
      t.trip_no, PHASE_LABELS[t.phase], t.start_date, t.end_date, diffDays(t.start_date, t.end_date) + 1,
      t.customer_name, t.customer_phone, t.vehicle_name, t.driver_name, t.driver_phone,
      t.pickup_city, t.pickup_state, t.drop_city, t.drop_state, t.round_trip, t.dest_city, t.dest_state,
      t.referrer_name, t.referrer_phone, t.odometer_start, t.odometer_end, kmOf(t),
      t.total_amount, t.received, t.status === "booked" ? balanceOf(t) : null, t.status === "booked" ? PAY_LABELS[payState(t)] : "Cancelled",
      t.driver_amount, t.driver_paid, t.status === "booked" ? driverOwed(t) : null, t.fuel, t.other, profitOf(t),
      profitWhenPaid(t), t.notes, t.created_by, t.created_ist,
    ]),
    [
      `Total (${plural(booked.length, "booking")}, cancelled not counted)`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      sum(booked, kmOf), sum(booked, (t) => t.total_amount), sum(booked, (t) => t.received), sum(booked, balanceOf), "",
      sum(booked, (t) => t.driver_amount), sum(booked, (t) => t.driver_paid), sum(booked, driverOwed),
      sum(booked, (t) => t.fuel), sum(booked, (t) => t.other), sum(booked, profitOf), sum(booked, profitWhenPaid),
    ],
    [],
  ];
}

/** Each other expense (toll, parking…) of the bookings, with the booking it belongs to */
function otherExpensesSection(entries: Expense[], trips: Trip[]): CsvValue[][] {
  const customer = new Map(trips.map((t) => [t.trip_no, t.customer_name]));
  const byName = new Map<string, number>();
  for (const e of kept(entries)) byName.set(e.description ?? "", (byName.get(e.description ?? "") ?? 0) + e.amount);
  return [
    [`OTHER EXPENSES of these bookings (${plural(entries.length, "entry", "entries")})`],
    ["Date", "Booking no", "Customer", "Vehicle", "Expense", "Amount (Rs)", "Note", "Added by", "Added at", "Removed by", "Removed at"],
    ...entries.map((e) => [
      e.spent_on, e.trip_no, e.trip_no ? customer.get(e.trip_no) : null, e.vehicle_name, e.description, e.amount, e.note,
      e.created_by, e.created_ist, e.deleted_by, e.deleted_ist,
    ]),
    ["Total (removed not counted)", "", "", "", "", sum(kept(entries), (e) => e.amount)],
    ...[...byName].sort((a, b) => b[1] - a[1]).map(([name, amount]) => [`  of which ${name}`, "", "", "", "", amount]),
    [],
  ];
}

function paymentColumns(p: PaymentRow): CsvValue[] {
  return [p.amount, PAYMENT_METHODS[p.method], p.note, p.created_by, p.created_ist, p.deleted_by, p.deleted_ist];
}

function repairsByVehicle(repairs: Expense[]): CsvValue[][] {
  const byVehicle = new Map<string, { count: number; amount: number }>();
  for (const e of kept(repairs)) {
    const v = byVehicle.get(e.vehicle_name) ?? { count: 0, amount: 0 };
    byVehicle.set(e.vehicle_name, { count: v.count + 1, amount: v.amount + e.amount });
  }
  const rows = [...byVehicle].sort((a, b) => b[1].amount - a[1].amount);
  return [
    [`BY VEHICLE (${plural(rows.length, "vehicle")})`],
    ["Vehicle", "Repairs", "Amount (Rs)"],
    ...rows.map(([name, v]) => [name, v.count, v.amount]),
    ["Total", sum(rows, ([, v]) => v.count), sum(rows, ([, v]) => v.amount)],
    [],
  ];
}

function repairsList(repairs: Expense[], month: string): CsvValue[][] {
  return [
    [`REPAIRS in ${monthLabel(month)} (${plural(repairs.length, "entry", "entries")})`],
    ["Date", "Vehicle", "What was done", "Amount (Rs)", "Shop", "City", "State", "Note", "Added by", "Added at", "Removed by", "Removed at"],
    ...repairs.map((e) => [
      e.spent_on, e.vehicle_name, e.description, e.amount, e.shop_name, e.shop_city, e.shop_state, e.note,
      e.created_by, e.created_ist, e.deleted_by, e.deleted_ist,
    ]),
    ["Total (removed not counted)", "", "", sum(kept(repairs), (e) => e.amount)],
    [],
  ];
}

// ---------- The reports ----------

/** Every booking starting in the month, with its customer, vehicle, driver, route, km, amounts and profit */
function bookingsReport(d: MonthData): Report {
  const { month, trips, otherExpenses } = d;
  const booked = live(trips);
  const rows: CsvValue[][] = [
    ...heading("Bookings report", month),
    ["SUMMARY", "Amount (Rs)"],
    [`Bookings starting in ${monthLabel(month)} (cancelled not counted)`, booked.length],
    ["Cancelled", trips.length - booked.length],
    ["Km travelled", sum(booked, kmOf)],
    ["Billed (booking totals)", sum(booked, (t) => t.total_amount)],
    ["Received so far", sum(booked, (t) => t.received)],
    ["Balance still due from customers", sum(booked, balanceOf)],
    ["Driver amounts agreed", sum(booked, (t) => t.driver_amount)],
    ["Fuel", sum(booked, (t) => t.fuel)],
    ["Other expenses (tolls, parking…)", sum(booked, (t) => t.other)],
    ["Profit (received − driver amount − fuel − other expenses)", sum(booked, profitOf)],
    [],
    ...bookingsSection(trips, month),
    ...otherExpensesSection(otherExpenses, trips),
    ["NOTES"],
    ["Bookings are listed in the month they start. Profit = received from the customer − driver amount − fuel − other expenses."],
    ["Repairs, FASTag, EMI and insurance belong to the vehicle, not a booking. Repairs have their own report."],
  ];
  return {
    type: "bookings",
    title: "Bookings report",
    filename: `annapurna-bookings-${fileMonth(month)}.csv`,
    rows,
    highlights: [
      { label: "Bookings", value: booked.length, money: false },
      { label: "Billed", value: sum(booked, (t) => t.total_amount), money: true },
      { label: "Received", value: sum(booked, (t) => t.received), money: true },
      { label: "Balance due", value: sum(booked, balanceOf), money: true },
    ],
    contents: plural(trips.length, "booking"),
  };
}

/** Each driver's bookings, days, km and money for the month, their bookings one by one, and payments made to them */
function driversReport(d: MonthData): Report {
  const { month, drivers, trips, payments } = d;
  const label = monthLabel(month);
  const driverTrips = live(trips).sort((a, b) => a.driver_name.localeCompare(b.driver_name) || a.start_date.localeCompare(b.start_date));
  const paid = payments.filter((p) => p.party === "driver");
  const rows: CsvValue[][] = [
    ...heading("Drivers report", month),
    ["SUMMARY", "Amount (Rs)"],
    ["Drivers", drivers.length],
    [`Bookings starting in ${label} (cancelled not counted)`, sum(drivers, (x) => x.bookings)],
    ["Driver amounts agreed for these bookings", sum(drivers, (x) => x.earned)],
    ["Paid so far for these bookings", sum(drivers, (x) => x.paidForMonth)],
    ["Still to pay for these bookings", sum(drivers, (x) => x.owedForMonth)],
    [`Paid to drivers in ${label} (any booking)`, sum(drivers, (x) => x.paidInMonth)],
    ["Still to pay drivers, all months", sum(drivers, (x) => x.owedAll)],
    [],

    [`DRIVERS (${plural(drivers.length, "driver")})`],
    [
      "Driver", "Mobile", "Status", "Bookings", "Days", "Km", "Driver amount agreed (Rs)", "Paid for these bookings (Rs)",
      "Still to pay for these bookings (Rs)", `Paid in ${label} (Rs)`, "Still to pay, all months (Rs)",
    ],
    ...drivers.map((x) => [
      x.name, x.phone, x.active ? "In use" : "Switched off", x.bookings, x.days, x.km, x.earned, x.paidForMonth, x.owedForMonth,
      x.paidInMonth, x.owedAll,
    ]),
    [
      "Total", "", "", sum(drivers, (x) => x.bookings), sum(drivers, (x) => x.days), sum(drivers, (x) => x.km), sum(drivers, (x) => x.earned),
      sum(drivers, (x) => x.paidForMonth), sum(drivers, (x) => x.owedForMonth), sum(drivers, (x) => x.paidInMonth), sum(drivers, (x) => x.owedAll),
    ],
    [],

    [`BOOKINGS BY DRIVER, starting in ${label} (${plural(driverTrips.length, "booking")})`],
    [
      "Driver", "Driver mobile", "Booking no", "Status", "Start date", "End date", "Days", "Vehicle", "Customer", "Route", "Km",
      "Driver amount (Rs)", "Paid to driver (Rs)", "Still to pay (Rs)",
    ],
    ...driverTrips.map((t) => [
      t.driver_name, t.driver_phone, t.trip_no, PHASE_LABELS[t.phase], t.start_date, t.end_date, diffDays(t.start_date, t.end_date) + 1,
      t.vehicle_name, t.customer_name, routeText(t), kmOf(t), t.driver_amount, t.driver_paid, driverOwed(t),
    ]),
    [],

    [`PAYMENTS TO DRIVERS in ${label} (${plural(paid.length, "payment")})`],
    ["Date", "Time", "Driver", "Booking no", "Customer", "Vehicle", "Amount (Rs)", "Method", "Note", "Recorded by", "Recorded at", "Removed by", "Removed at"],
    ...paid.map((p) => [p.paid_date, p.paid_time, p.driver_name, p.trip_no, p.customer_name, p.vehicle_name, ...paymentColumns(p)]),
    ["Total (removed not counted)", "", "", "", "", "", sum(kept(paid), (p) => p.amount)],
    [],

    ["NOTES"],
    ["Drivers in use are always listed; switched-off drivers only when they drove or were paid in the month."],
    ["Bookings count in the month they start. \"Paid in the month\" counts payments made during the month for any booking."],
    ["Removed payments are listed with who removed them, but not counted in any total."],
  ];
  return {
    type: "drivers",
    title: "Drivers report",
    filename: `annapurna-drivers-${fileMonth(month)}.csv`,
    rows,
    highlights: [
      { label: "Drivers", value: drivers.length, money: false },
      { label: "Agreed", value: sum(drivers, (x) => x.earned), money: true },
      { label: `Paid in ${MONTHS_LONG[Number(month.slice(5)) - 1].slice(0, 3)}`, value: sum(drivers, (x) => x.paidInMonth), money: true },
      { label: "Still to pay", value: sum(drivers, (x) => x.owedForMonth), money: true },
    ],
    contents: `${plural(drivers.length, "driver")}, ${plural(driverTrips.length, "booking")}, ${plural(paid.length, "payment")}`,
  };
}

/** Every repair dated in the month, and each vehicle's total */
function repairsReport(d: MonthData): Report {
  const { month } = d;
  const { repairs } = d;
  const counted = kept(repairs);
  const vehicles = new Set(counted.map((e) => e.vehicle_id)).size;
  const rows: CsvValue[][] = [
    ...heading("Repairs report", month),
    ["SUMMARY", "Amount (Rs)"],
    ["Repairs (removed not counted)", counted.length],
    ["Vehicles repaired", vehicles],
    ["Total spent on repairs", sum(counted, (e) => e.amount)],
    [],
    ...repairsByVehicle(repairs),
    ...repairsList(repairs, month),
    ["NOTES"],
    ["Repairs count on the date they were done. Removed entries are listed with who removed them, but not counted."],
  ];
  return {
    type: "repairs",
    title: "Repairs report",
    filename: `annapurna-repairs-${fileMonth(month)}.csv`,
    rows,
    highlights: [
      { label: "Repairs", value: counted.length, money: false },
      { label: "Vehicles", value: vehicles, money: false },
      { label: "Total", value: sum(counted, (e) => e.amount), money: true },
    ],
    contents: plural(repairs.length, "repair"),
  };
}

const BUILDERS: Record<ReportType, (d: MonthData) => Report> = {
  bookings: bookingsReport,
  drivers: driversReport,
  repairs: repairsReport,
};

export function makeReport(type: ReportType, data: MonthData): Report {
  return BUILDERS[type](data);
}

export async function buildReport(type: ReportType, month: string): Promise<Report> {
  return makeReport(type, await loadMonth(month));
}

/** How each line of a report looks in Excel: the title, section headings, shaded column headers and bold totals */
function rowStyles(rows: CsvValue[][]): (row: CsvValue[], index: number) => RowStyle {
  const filled = (row: CsvValue[] | undefined) => (row ?? []).filter((v) => v !== null && v !== undefined && v !== "").length;
  const isHeading = (row: CsvValue[] | undefined) => filled(row) === 1 && /^[A-Z]{2,}(?=[ (]|$)/.test(String(row?.[0] ?? ""));
  return (row, i) => {
    if (i === 0) return "title";
    if (row[0] === "SUMMARY" || (filled(row) > 1 && isHeading(rows[i - 1]))) return "header";
    if (isHeading(row)) return "heading";
    if (typeof row[0] === "string" && row[0].startsWith("Total")) return "total";
    return "plain";
  };
}

/** All three reports as tabs (Bookings, Drivers, Repairs) of one Excel file */
export async function buildWorkbook(month: string): Promise<{ filename: string; data: Uint8Array; contents: string }> {
  const data = await loadMonth(month);
  const reports = REPORT_TYPES.map((type) => makeReport(type, data));
  return {
    filename: workbookName(month),
    data: toXlsx(reports.map((r) => ({ name: r.title.replace(/ report$/, ""), rows: r.rows, rowStyle: rowStyles(r.rows) }))),
    contents: reports.map((r) => r.contents).join("; "),
  };
}
