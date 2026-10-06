import { dbErrorCode, query } from "../db";

const UNIQUE_VIOLATION = "23505";

export type Vehicle = {
  id: number;
  name: string;
  kind: "car";
  active: boolean;
  created_ist: string;
  created_by: string | null;
  /** Bookings that weren't cancelled */
  trips: number;
  km: number;
  fuel: number;
  repairs: number;
  /** Booking number if the vehicle is out on a trip today */
  on_trip: string | null;
  /** Anything recorded against it; vehicles without history can be deleted outright */
  used: boolean;
  is_sample: boolean;
};

export type Driver = {
  id: number;
  name: string;
  phone: string;
  active: boolean;
  created_ist: string;
  created_by: string | null;
  trips: number;
  /** Still to be paid to the driver, over all bookings */
  owed: number;
  on_trip: string | null;
  used: boolean;
  is_sample: boolean;
};

const TODAY = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

const VEHICLE_COLUMNS = `
  v.id::int AS id, v.name, v.kind, v.active, v.created_by, v.is_sample,
  to_char(v.created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') AS created_ist,
  (SELECT count(*)::int FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'booked') AS trips,
  (SELECT coalesce(sum(t.odometer_end - t.odometer_start), 0)::int FROM trips t
     WHERE t.vehicle_id = v.id AND t.status = 'booked' AND t.odometer_end IS NOT NULL) AS km,
  (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
     WHERE e.vehicle_id = v.id AND e.kind = 'fuel' AND e.deleted_at IS NULL) AS fuel,
  (SELECT coalesce(sum(e.amount), 0)::float8 FROM vehicle_expenses e
     WHERE e.vehicle_id = v.id AND e.kind = 'repair' AND e.deleted_at IS NULL) AS repairs,
  (SELECT t.trip_no FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'booked'
     AND ${TODAY} BETWEEN t.start_date AND t.end_date LIMIT 1) AS on_trip,
  (EXISTS (SELECT 1 FROM trips t WHERE t.vehicle_id = v.id)
   OR EXISTS (SELECT 1 FROM vehicle_expenses e WHERE e.vehicle_id = v.id)) AS used`;

const DRIVER_COLUMNS = `
  d.id::int AS id, d.name, d.phone, d.active, d.created_by, d.is_sample,
  to_char(d.created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') AS created_ist,
  (SELECT count(*)::int FROM trips t WHERE t.driver_id = d.id AND t.status = 'booked') AS trips,
  (SELECT coalesce(sum(greatest(coalesce(t.driver_amount, 0) - coalesce((
      SELECT sum(p.amount) FROM trip_payments p
      WHERE p.trip_id = t.id AND p.party = 'driver' AND p.deleted_at IS NULL), 0), 0)), 0)::float8
   FROM trips t WHERE t.driver_id = d.id AND t.status = 'booked') AS owed,
  (SELECT t.trip_no FROM trips t WHERE t.driver_id = d.id AND t.status = 'booked'
     AND ${TODAY} BETWEEN t.start_date AND t.end_date LIMIT 1) AS on_trip,
  EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.id) AS used`;

/** Active vehicles first, then by name */
export async function listVehicles(): Promise<Vehicle[]> {
  return query<Vehicle>(`SELECT ${VEHICLE_COLUMNS} FROM vehicles v ORDER BY v.active DESC, lower(v.name)`);
}

export async function getVehicle(id: number): Promise<Vehicle | null> {
  if (!Number.isSafeInteger(id)) return null;
  const [row] = await query<Vehicle>(`SELECT ${VEHICLE_COLUMNS} FROM vehicles v WHERE v.id = $1`, [id]);
  return row ?? null;
}

export async function listDrivers(): Promise<Driver[]> {
  return query<Driver>(`SELECT ${DRIVER_COLUMNS} FROM drivers d ORDER BY d.active DESC, lower(d.name)`);
}

export async function getDriver(id: number): Promise<Driver | null> {
  if (!Number.isSafeInteger(id)) return null;
  const [row] = await query<Driver>(`SELECT ${DRIVER_COLUMNS} FROM drivers d WHERE d.id = $1`, [id]);
  return row ?? null;
}

/** Just names, for the booking form's dropdowns */
export async function fleetChoices(): Promise<{
  vehicles: { id: number; name: string; active: boolean }[];
  drivers: { id: number; name: string; phone: string; active: boolean }[];
}> {
  const [vehicles, drivers] = await Promise.all([
    query<{ id: number; name: string; active: boolean }>(`SELECT id::int AS id, name, active FROM vehicles ORDER BY lower(name)`),
    query<{ id: number; name: string; phone: string; active: boolean }>(
      `SELECT id::int AS id, name, phone, active FROM drivers ORDER BY lower(name)`,
    ),
  ]);
  return { vehicles, drivers };
}

type Saved = "ok" | "exists" | "missing";

async function save(sql: string, params: unknown[]): Promise<Saved> {
  try {
    const rows = await query(sql, params);
    return rows.length ? "ok" : "missing";
  } catch (err) {
    if (dbErrorCode(err) === UNIQUE_VIOLATION) return "exists";
    throw err;
  }
}

export function createVehicle(name: string, by: string): Promise<Saved> {
  return save(`INSERT INTO vehicles (name, created_by) VALUES ($1, $2) RETURNING id`, [name, by]);
}

export function renameVehicle(id: number, name: string, by: string): Promise<Saved> {
  return save(`UPDATE vehicles SET name = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING id`, [id, name, by]);
}

export function createDriver(d: { name: string; phone: string }, by: string): Promise<Saved> {
  return save(`INSERT INTO drivers (name, phone, created_by) VALUES ($1, $2, $3) RETURNING id`, [d.name, d.phone, by]);
}

export function updateDriver(id: number, d: { name: string; phone: string }, by: string): Promise<Saved> {
  return save(
    `UPDATE drivers SET name = $2, phone = $3, updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING id`,
    [id, d.name, d.phone, by],
  );
}

/** Switch a vehicle or driver off (hidden from new bookings) or back on */
export async function setActive(table: "vehicles" | "drivers", id: number, active: boolean, by: string): Promise<boolean> {
  const rows = await query(
    `UPDATE ${table} SET active = $2, updated_at = now(), updated_by = $3 WHERE id = $1 AND active <> $2 RETURNING id`,
    [id, active, by],
  );
  return rows.length > 0;
}

/** Deletes a vehicle or driver that was added by mistake: only possible while nothing refers to it */
export async function deleteUnused(table: "vehicles" | "drivers", id: number): Promise<boolean> {
  const rows =
    table === "vehicles"
      ? await query(
          `DELETE FROM vehicles v WHERE v.id = $1
             AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.vehicle_id = v.id)
             AND NOT EXISTS (SELECT 1 FROM vehicle_expenses e WHERE e.vehicle_id = v.id)
           RETURNING id`,
          [id],
        )
      : await query(
          `DELETE FROM drivers d WHERE d.id = $1 AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.id) RETURNING id`,
          [id],
        );
  return rows.length > 0;
}
