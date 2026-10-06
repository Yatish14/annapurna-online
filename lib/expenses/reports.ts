import type { CsvValue } from "../csv";
import { diffDays, MONTHS_LONG } from "../dates";
import { PAYMENT_METHODS } from "./money";
import { vehiclesMonth } from "./overview";
import {
  balanceOf,
  driverOwed,
  expensesIn,
  kmOf,
  PAY_LABELS,
  payState,
  paymentsIn,
  PHASE_LABELS,
  profitOf,
  tripsStartingIn,
} from "./trips";

export const REPORT_TYPES = ["bookings", "payments", "costs", "vehicles"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORTS: Record<ReportType, { title: string; description: string }> = {
  bookings: {
    title: "Bookings",
    description:
      "One row per booking starting in the month: customer, vehicle, driver, route, referrer, km, total, received, balance, driver amount, fuel, repairs and profit.",
  },
  payments: {
    title: "Payments",
    description: "Every payment made in the month, from customers and to drivers, with date, time, method and who recorded it.",
  },
  costs: {
    title: "Fuel & repairs",
    description: "Every fuel fill-up and repair dated in the month, with the vehicle, booking, shop and place.",
  },
  vehicles: {
    title: "Vehicle summary",
    description: "Each vehicle's bookings, km, billed amount, driver amounts, fuel, repairs and profit for the month.",
  },
};

export function isReportType(value: unknown): value is ReportType {
  return typeof value === "string" && (REPORT_TYPES as readonly string[]).includes(value);
}

export const monthLabel = (month: string) => `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

export type Report = {
  filename: string;
  rows: CsvValue[][];
  /** Data rows (without the header and totals) */
  count: number;
  /** A few totals to show on the Reports page */
  highlights: { label: string; amount: number }[];
};

const sum = <T>(items: T[], pick: (item: T) => number | null) => items.reduce((acc, item) => acc + (pick(item) ?? 0), 0);

/** The report as spreadsheet rows: a header row, one row per item, then totals */
export async function buildReport(type: ReportType, month: string): Promise<Report> {
  const filename = `annapurna-${type === "costs" ? "fuel-repairs" : type === "vehicles" ? "vehicle-summary" : type}-${month}.csv`;

  if (type === "bookings") {
    const trips = await tripsStartingIn(month);
    const live = trips.filter((t) => t.status === "booked");
    const rows: CsvValue[][] = [
      [
        "Booking no", "Status", "Start date", "End date", "Days", "Customer", "Customer mobile",
        "Vehicle", "Driver", "Driver mobile", "Pickup city", "Pickup state", "Drop city", "Drop state",
        "Round trip", "Went to (city)", "Went to (state)", "Referred by", "Referrer mobile",
        "Odometer start", "Odometer end", "Km", "Total (Rs)", "Received (Rs)", "Balance due (Rs)", "Payment status",
        "Driver amount (Rs)", "Paid to driver (Rs)", "Driver still to pay (Rs)", "Fuel (Rs)", "Repairs (Rs)", "Profit (Rs)",
        "Notes", "Created by", "Created at", "Sample",
      ],
      ...trips.map((t) => [
        t.trip_no, PHASE_LABELS[t.phase], t.start_date, t.end_date, diffDays(t.start_date, t.end_date) + 1,
        t.customer_name, t.customer_phone, t.vehicle_name, t.driver_name, t.driver_phone,
        t.pickup_city, t.pickup_state, t.drop_city, t.drop_state, t.round_trip, t.dest_city, t.dest_state,
        t.referrer_name, t.referrer_phone, t.odometer_start, t.odometer_end, kmOf(t),
        t.total_amount, t.received, t.status === "booked" ? balanceOf(t) : null, t.status === "booked" ? PAY_LABELS[payState(t)] : "Cancelled",
        t.driver_amount, t.driver_paid, t.status === "booked" ? driverOwed(t) : null, t.fuel, t.repairs, profitOf(t),
        t.notes, t.created_by, t.created_ist, t.is_sample,
      ]),
    ];
    const totals = {
      km: sum(live, kmOf),
      total: sum(live, (t) => t.total_amount),
      received: sum(live, (t) => t.received),
      balance: sum(live, balanceOf),
      driver: sum(live, (t) => t.driver_amount),
      driverPaid: sum(live, (t) => t.driver_paid),
      driverOwed: sum(live, driverOwed),
      fuel: sum(live, (t) => t.fuel),
      repairs: sum(live, (t) => t.repairs),
      profit: sum(live, profitOf),
    };
    rows.push(
      [],
      [
        `Total (${live.length} bookings, cancelled not counted)`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        totals.km, totals.total, totals.received, totals.balance, "", totals.driver, totals.driverPaid, totals.driverOwed,
        totals.fuel, totals.repairs, totals.profit,
      ],
    );
    return {
      filename,
      rows,
      count: trips.length,
      highlights: [
        { label: "Billed", amount: totals.total },
        { label: "Balance due", amount: totals.balance },
        { label: "Profit", amount: totals.profit },
      ],
    };
  }

  if (type === "payments") {
    const payments = await paymentsIn(month);
    const kept = payments.filter((p) => !p.deleted_ist);
    const fromCustomers = sum(kept.filter((p) => p.party === "customer"), (p) => p.amount);
    const toDrivers = sum(kept.filter((p) => p.party === "driver"), (p) => p.amount);
    return {
      filename,
      count: payments.length,
      rows: [
        [
          "Date", "Time", "Booking no", "Customer", "Vehicle", "Driver", "Type", "Amount (Rs)", "Method", "Note",
          "Recorded by", "Recorded at", "Removed by", "Removed at",
        ],
        ...payments.map((p) => [
          p.paid_date, p.paid_time, p.trip_no, p.customer_name, p.vehicle_name, p.driver_name,
          p.party === "customer" ? "From customer" : "To driver", p.amount, PAYMENT_METHODS[p.method], p.note,
          p.created_by, p.created_ist, p.deleted_by, p.deleted_ist,
        ]),
        [],
        ["Received from customers (removed payments not counted)", "", "", "", "", "", "", fromCustomers],
        ["Paid to drivers (removed payments not counted)", "", "", "", "", "", "", toDrivers],
      ],
      highlights: [
        { label: "From customers", amount: fromCustomers },
        { label: "To drivers", amount: toDrivers },
      ],
    };
  }

  if (type === "costs") {
    const entries = await expensesIn(month);
    const kept = entries.filter((e) => !e.deleted_ist);
    const fuel = sum(kept.filter((e) => e.kind === "fuel"), (e) => e.amount);
    const repairs = sum(kept.filter((e) => e.kind === "repair"), (e) => e.amount);
    const litres = sum(kept.filter((e) => e.kind === "fuel"), (e) => e.litres);
    return {
      filename,
      count: entries.length,
      rows: [
        [
          "Date", "Vehicle", "Booking no", "Type", "Amount (Rs)", "Litres", "What was done", "Shop", "City", "State", "Note",
          "Added by", "Added at", "Removed by", "Removed at",
        ],
        ...entries.map((e) => [
          e.spent_on, e.vehicle_name, e.trip_no, e.kind === "fuel" ? "Fuel" : "Repair", e.amount, e.litres, e.description,
          e.shop_name, e.shop_city, e.shop_state, e.note, e.created_by, e.created_ist, e.deleted_by, e.deleted_ist,
        ]),
        [],
        ["Fuel total (removed entries not counted)", "", "", "", fuel, Math.round(litres * 100) / 100],
        ["Repairs total (removed entries not counted)", "", "", "", repairs],
      ],
      highlights: [
        { label: "Fuel", amount: fuel },
        { label: "Repairs", amount: repairs },
      ],
    };
  }

  const vehicles = await vehiclesMonth(month);
  const profit = (v: (typeof vehicles)[number]) => v.billed - v.driverAmount - v.fuel - v.repairs;
  return {
    filename,
    count: vehicles.length,
    rows: [
      ["Vehicle", "Status", "Bookings", "Km", "Billed (Rs)", "Driver amount (Rs)", "Fuel (Rs)", "Repairs (Rs)", "Profit (Rs)"],
      ...vehicles.map((v) => [
        v.name, v.active ? "In use" : "Switched off", v.bookings, v.km, v.billed, v.driverAmount, v.fuel, v.repairs, profit(v),
      ]),
      [],
      [
        "Total", "", sum(vehicles, (v) => v.bookings), sum(vehicles, (v) => v.km), sum(vehicles, (v) => v.billed),
        sum(vehicles, (v) => v.driverAmount), sum(vehicles, (v) => v.fuel), sum(vehicles, (v) => v.repairs), sum(vehicles, profit),
      ],
      [],
      ["Billed and driver amounts count bookings that start in the month; fuel and repairs count the date they were spent."],
    ],
    highlights: [
      { label: "Billed", amount: sum(vehicles, (v) => v.billed) },
      { label: "Profit", amount: sum(vehicles, profit) },
    ],
  };
}
