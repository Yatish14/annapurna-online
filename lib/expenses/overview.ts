import { query } from "../db";

/**
 * Figures for one month ("YYYY-MM"):
 * - bookings, km, billed and driver amounts: bookings starting in the month
 * - received and paid to drivers: payments made in the month
 * - fuel, other booking expenses (tolls, parking…), repairs, FASTag, EMI and insurance: payments dated in the month
 */
export type MonthSummary = {
  bookings: number;
  km: number;
  billed: number;
  driverAmount: number;
  received: number;
  driverPaid: number;
  fuel: number;
  /** Bookings' other expenses: tolls, parking… */
  other: number;
  repairs: number;
  fastag: number;
  emi: number;
  insurance: number;
};

export type VehicleMonth = {
  id: number;
  name: string;
  active: boolean;
  bookings: number;
  km: number;
  billed: number;
  /** Paid so far by the customers of the bookings starting in the month */
  received: number;
  driverAmount: number;
  fuel: number;
  /** Bookings' other expenses: tolls, parking… */
  other: number;
  repairs: number;
  fastag: number;
  emi: number;
  insurance: number;
};

/**
 * A vehicle's profit for the month, on money actually received:
 * received − driver amounts − fuel − other booking expenses − repairs − FASTag − EMI − insurance
 */
export function vehicleProfit(
  v: Pick<VehicleMonth, "received" | "driverAmount" | "fuel" | "other" | "repairs" | "fastag" | "emi" | "insurance">,
): number {
  return v.received - v.driverAmount - v.fuel - v.other - v.repairs - v.fastag - v.emi - v.insurance;
}

/** Money still to come in from customers, and still to be paid to drivers, over all bookings */
export type Outstanding = { customerDue: number; customerTrips: number; driverDue: number; driverTrips: number };

const IN_MONTH = (col: string) => `${col} >= $1::date AND ${col} < ($1::date + interval '1 month')::date`;
const PAID_DAY = `(p.paid_at AT TIME ZONE 'Asia/Kolkata')::date`;

export async function monthSummary(month: string): Promise<MonthSummary> {
  const [row] = await query<MonthSummary>(
    `SELECT
       (SELECT count(*)::int FROM trips t WHERE t.status = 'booked' AND ${IN_MONTH("t.start_date")}) AS bookings,
       (SELECT coalesce(sum(coalesce(t.odometer_end - t.odometer_start, t.km_direct)), 0)::int FROM trips t
          WHERE t.status = 'booked' AND ${IN_MONTH("t.start_date")}) AS km,
       (SELECT coalesce(sum(t.total_amount), 0)::float8 FROM trips t WHERE t.status = 'booked' AND ${IN_MONTH("t.start_date")}) AS billed,
       (SELECT coalesce(sum(t.driver_amount), 0)::float8 FROM trips t WHERE t.status = 'booked' AND ${IN_MONTH("t.start_date")}) AS "driverAmount",
       (SELECT coalesce(sum(p.amount), 0)::float8 FROM trip_payments p
          WHERE p.party = 'customer' AND p.deleted_at IS NULL AND ${IN_MONTH(PAID_DAY)}) AS received,
       (SELECT coalesce(sum(p.amount), 0)::float8 FROM trip_payments p
          WHERE p.party = 'driver' AND p.deleted_at IS NULL AND ${IN_MONTH(PAID_DAY)}) AS "driverPaid",
       (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.kind = 'fuel' AND e.deleted_at IS NULL AND ${IN_MONTH("e.spent_on")}) AS fuel,
       (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.kind = 'other' AND e.deleted_at IS NULL AND ${IN_MONTH("e.spent_on")}) AS other,
       (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.kind = 'repair' AND e.deleted_at IS NULL AND ${IN_MONTH("e.spent_on")}) AS repairs,
       (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.kind = 'fastag' AND e.deleted_at IS NULL AND ${IN_MONTH("e.spent_on")}) AS fastag,
       (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.kind = 'emi' AND e.deleted_at IS NULL AND ${IN_MONTH("e.spent_on")}) AS emi,
       (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
          WHERE e.kind = 'insurance' AND e.deleted_at IS NULL AND ${IN_MONTH("e.spent_on")}) AS insurance`,
    [`${month}-01`],
  );
  return row;
}

/** Each vehicle's figures for the month (switched-off vehicles only when they have any) */
export async function vehiclesMonth(month: string): Promise<VehicleMonth[]> {
  const rows = await query<VehicleMonth>(
    `SELECT v.id::int AS id, v.name, v.active,
       coalesce(tr.bookings, 0)::int AS bookings, coalesce(tr.km, 0)::int AS km,
       coalesce(tr.billed, 0)::float8 AS billed, coalesce(tr.received, 0)::float8 AS received,
       coalesce(tr.driver_amount, 0)::float8 AS "driverAmount",
       coalesce(ex.fuel, 0)::float8 AS fuel, coalesce(ex.other, 0)::float8 AS other, coalesce(ex.repairs, 0)::float8 AS repairs, coalesce(ex.fastag, 0)::float8 AS fastag,
       coalesce(ex.emi, 0)::float8 AS emi, coalesce(ex.insurance, 0)::float8 AS insurance
     FROM vehicles v
     LEFT JOIN LATERAL (
       SELECT count(*) AS bookings, sum(coalesce(t.odometer_end - t.odometer_start, t.km_direct)) AS km,
              sum(t.total_amount) AS billed, sum(t.driver_amount) AS driver_amount,
              sum((SELECT coalesce(sum(p.amount), 0) FROM trip_payments p
                   WHERE p.trip_id = t.id AND p.party = 'customer' AND p.deleted_at IS NULL)) AS received
       FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'booked' AND ${IN_MONTH("t.start_date")}
     ) tr ON true
     LEFT JOIN LATERAL (
       SELECT sum(e.amount) FILTER (WHERE e.kind = 'fuel') AS fuel, sum(e.amount) FILTER (WHERE e.kind = 'repair') AS repairs,
              sum(e.amount) FILTER (WHERE e.kind = 'fastag') AS fastag, sum(e.amount) FILTER (WHERE e.kind = 'other') AS other,
              sum(e.amount) FILTER (WHERE e.kind = 'emi') AS emi, sum(e.amount) FILTER (WHERE e.kind = 'insurance') AS insurance
       FROM vehicle_expenses e WHERE e.vehicle_id = v.id AND e.deleted_at IS NULL AND ${IN_MONTH("e.spent_on")}
     ) ex ON true
     ORDER BY v.active DESC, lower(v.name)`,
    [`${month}-01`],
  );
  return rows.filter((v) => v.active || v.bookings || v.fuel || v.other || v.repairs || v.fastag || v.emi || v.insurance);
}

export async function outstanding(): Promise<Outstanding> {
  const [row] = await query<Outstanding>(
    `WITH b AS (
       SELECT t.total_amount, t.driver_amount,
              coalesce(sum(p.amount) FILTER (WHERE p.party = 'customer'), 0) AS received,
              coalesce(sum(p.amount) FILTER (WHERE p.party = 'driver'), 0) AS driver_paid
       FROM trips t
       LEFT JOIN trip_payments p ON p.trip_id = t.id AND p.deleted_at IS NULL
       WHERE t.status = 'booked'
       GROUP BY t.id
     )
     SELECT coalesce(sum(greatest(total_amount - received, 0)), 0)::float8 AS "customerDue",
            count(*) FILTER (WHERE total_amount > received)::int AS "customerTrips",
            coalesce(sum(greatest(driver_amount - driver_paid, 0)), 0)::float8 AS "driverDue",
            count(*) FILTER (WHERE driver_amount > driver_paid)::int AS "driverTrips"
     FROM b`,
  );
  return row;
}
