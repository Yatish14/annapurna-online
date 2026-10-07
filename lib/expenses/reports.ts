import type { CsvValue } from "../csv";
import { diffDays, MONTHS_LONG } from "../dates";
import { PAYMENT_METHODS } from "./money";
import { monthSummary, vehicleProfit, vehiclesMonth } from "./overview";
import {
  balanceOf,
  driverOwed,
  expensesIn,
  kmOf,
  EXPENSE_LABELS,
  PAY_LABELS,
  payState,
  paymentsIn,
  PHASE_LABELS,
  profitOf,
  profitWhenPaid,
  tripsStartingIn,
} from "./trips";

export const monthLabel = (month: string) => `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

export type Report = {
  filename: string;
  rows: CsvValue[][];
  /** How many rows each section lists */
  counts: { bookings: number; payments: number; costs: number; vehicles: number };
  /** A few totals to show on the Reports page */
  highlights: { label: string; amount: number }[];
};

const sum = <T>(items: T[], pick: (item: T) => number | null) => items.reduce((acc, item) => acc + (pick(item) ?? 0), 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Everything about one month in one CSV file, section after section: summary, vehicles, bookings,
 * payments and vehicle costs. Each section has its own header row and totals.
 */
export async function buildMonthlyReport(month: string): Promise<Report> {
  const [summary, vehicles, trips, payments, entries] = await Promise.all([
    monthSummary(month),
    vehiclesMonth(month),
    tripsStartingIn(month),
    paymentsIn(month),
    expensesIn(month),
  ]);
  const label = monthLabel(month);
  const live = trips.filter((t) => t.status === "booked");
  const keptPayments = payments.filter((p) => !p.deleted_ist);
  const keptCosts = entries.filter((e) => !e.deleted_ist);
  const { fuel, repairs, emi, insurance } = summary;
  const moneyOut = summary.driverPaid + fuel + repairs + emi + insurance;
  const vehicleTotal = sum(vehicles, vehicleProfit);
  const downloaded = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date());

  const rows: CsvValue[][] = [
    [`Annapurna Online Services · Expense Tracker · Monthly report for ${label}`],
    [`Downloaded ${downloaded}`],
    [],

    // ---------- Summary ----------
    ["SUMMARY", "Amount (Rs)"],
    ["Money in: received from customers in the month", summary.received],
    ["Money out: paid to drivers", summary.driverPaid],
    ["Money out: fuel", fuel],
    ["Money out: repairs", repairs],
    ["Money out: EMI", emi],
    ["Money out: insurance", insurance],
    ["Money out: total", moneyOut],
    ["Net (money in − money out)", summary.received - moneyOut],
    [],
    [`Bookings starting in ${label} (cancelled not counted)`, live.length],
    ["Km travelled", summary.km],
    ["Billed (booking totals)", summary.billed],
    ["Received so far for these bookings", sum(live, (t) => t.received)],
    ["Balance still due from customers", sum(live, balanceOf)],
    ["Driver amounts agreed", summary.driverAmount],
    ["Still to pay drivers", sum(live, driverOwed)],
    ["Profit (all vehicles, on money received)", vehicleTotal],
    [],

    // ---------- Vehicles ----------
    [`VEHICLES (${plural(vehicles.length, "vehicle")})`],
    ["Vehicle", "Status", "Bookings", "Km", "Billed (Rs)", "Received (Rs)", "Driver amount (Rs)", "Fuel (Rs)", "Repairs (Rs)", "EMI (Rs)", "Insurance (Rs)", "Profit (Rs)"],
    ...vehicles.map((v) => [
      v.name, v.active ? "In use" : "Switched off", v.bookings, v.km, v.billed, v.received, v.driverAmount, v.fuel, v.repairs, v.emi, v.insurance, vehicleProfit(v),
    ]),
    [
      "Total", "", sum(vehicles, (v) => v.bookings), sum(vehicles, (v) => v.km), sum(vehicles, (v) => v.billed),
      sum(vehicles, (v) => v.received), sum(vehicles, (v) => v.driverAmount), sum(vehicles, (v) => v.fuel), sum(vehicles, (v) => v.repairs),
      sum(vehicles, (v) => v.emi), sum(vehicles, (v) => v.insurance), vehicleTotal,
    ],
    [],

    // ---------- Bookings ----------
    [`BOOKINGS starting in ${label} (${plural(trips.length, "booking")})`],
    [
      "Booking no", "Status", "Start date", "End date", "Days", "Customer", "Customer mobile",
      "Vehicle", "Driver", "Driver mobile", "Pickup city", "Pickup state", "Drop city", "Drop state",
      "Round trip", "Went to (city)", "Went to (state)", "Referred by", "Referrer mobile",
      "Odometer start", "Odometer end", "Km", "Total (Rs)", "Received (Rs)", "Balance due (Rs)", "Payment status",
      "Driver amount (Rs)", "Paid to driver (Rs)", "Driver still to pay (Rs)", "Fuel (Rs)", "Repairs (Rs)", "Profit (Rs)",
      "Profit when fully paid (Rs)", "Notes", "Created by", "Created at",
    ],
    ...trips.map((t) => [
      t.trip_no, PHASE_LABELS[t.phase], t.start_date, t.end_date, diffDays(t.start_date, t.end_date) + 1,
      t.customer_name, t.customer_phone, t.vehicle_name, t.driver_name, t.driver_phone,
      t.pickup_city, t.pickup_state, t.drop_city, t.drop_state, t.round_trip, t.dest_city, t.dest_state,
      t.referrer_name, t.referrer_phone, t.odometer_start, t.odometer_end, kmOf(t),
      t.total_amount, t.received, t.status === "booked" ? balanceOf(t) : null, t.status === "booked" ? PAY_LABELS[payState(t)] : "Cancelled",
      t.driver_amount, t.driver_paid, t.status === "booked" ? driverOwed(t) : null, t.fuel, t.repairs, profitOf(t),
      profitWhenPaid(t), t.notes, t.created_by, t.created_ist,
    ]),
    [
      `Total (${plural(live.length, "booking")}, cancelled not counted)`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      sum(live, kmOf), sum(live, (t) => t.total_amount), sum(live, (t) => t.received), sum(live, balanceOf), "",
      sum(live, (t) => t.driver_amount), sum(live, (t) => t.driver_paid), sum(live, driverOwed),
      sum(live, (t) => t.fuel), sum(live, (t) => t.repairs), sum(live, profitOf), sum(live, profitWhenPaid),
    ],
    [],

    // ---------- Payments ----------
    [`PAYMENTS made in ${label} (${plural(payments.length, "payment")})`],
    [
      "Date", "Time", "Booking no", "Customer", "Vehicle", "Driver", "Type", "Amount (Rs)", "Method", "Note",
      "Recorded by", "Recorded at", "Removed by", "Removed at",
    ],
    ...payments.map((p) => [
      p.paid_date, p.paid_time, p.trip_no, p.customer_name, p.vehicle_name, p.driver_name,
      p.party === "customer" ? "From customer" : "To driver", p.amount, PAYMENT_METHODS[p.method], p.note,
      p.created_by, p.created_ist, p.deleted_by, p.deleted_ist,
    ]),
    ["Received from customers (removed not counted)", "", "", "", "", "", "", sum(keptPayments.filter((p) => p.party === "customer"), (p) => p.amount)],
    ["Paid to drivers (removed not counted)", "", "", "", "", "", "", sum(keptPayments.filter((p) => p.party === "driver"), (p) => p.amount)],
    [],

    // ---------- Vehicle costs ----------
    [`VEHICLE COSTS paid in ${label} (${entries.length} ${entries.length === 1 ? "entry" : "entries"})`],
    [
      "Date", "Vehicle", "Booking no", "Type", "Amount (Rs)", "Litres", "EMI for month", "Details", "Shop", "City", "State", "Note",
      "Added by", "Added at", "Removed by", "Removed at",
    ],
    ...entries.map((e) => [
      e.spent_on, e.vehicle_name, e.trip_no, EXPENSE_LABELS[e.kind], e.amount, e.litres, e.period ? monthLabel(e.period) : null, e.description,
      e.shop_name, e.shop_city, e.shop_state, e.note, e.created_by, e.created_ist, e.deleted_by, e.deleted_ist,
    ]),
    ["Fuel (removed not counted)", "", "", "", fuel, Math.round(sum(keptCosts.filter((e) => e.kind === "fuel"), (e) => e.litres) * 100) / 100],
    ["Repairs (removed not counted)", "", "", "", repairs],
    ["EMI (removed not counted)", "", "", "", emi],
    ["Insurance (removed not counted)", "", "", "", insurance],
    ["All costs", "", "", "", fuel + repairs + emi + insurance],
    [],

    // ---------- How it's worked out ----------
    ["NOTES"],
    ["Money in and money out count what was actually paid during the month, for any booking."],
    ["Booking figures (billed, received so far, driver amounts) count bookings that start in the month."],
    ["Booking profit = received from the customer − driver amount − fuel − repairs. \"When fully paid\" uses the total instead of what was received."],
    ["Vehicle profit = received − driver amount − fuel − repairs − EMI − insurance."],
    ["Removed payments and costs are listed with who removed them, but not counted in any total."],
  ];

  return {
    filename: `annapurna-monthly-report-${month}.csv`,
    rows,
    counts: { bookings: trips.length, payments: payments.length, costs: entries.length, vehicles: vehicles.length },
    highlights: [
      { label: "Money in", amount: summary.received },
      { label: "Money out", amount: moneyOut },
      { label: "Billed", amount: summary.billed },
      { label: "Balance due", amount: sum(live, balanceOf) },
      { label: "Profit", amount: vehicleTotal },
    ],
  };
}
