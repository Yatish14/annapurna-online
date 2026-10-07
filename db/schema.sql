-- Annapurna bookings schema. Safe to run repeatedly (npm run db:migrate).

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SEQUENCE IF NOT EXISTS booking_ref_seq START 1001;

CREATE TABLE IF NOT EXISTS bookings (
  id              bigserial PRIMARY KEY,
  ref             text NOT NULL UNIQUE DEFAULT ('AN-' || nextval('booking_ref_seq')),
  phone           text NOT NULL,
  customer_name   text,
  car             text NOT NULL CHECK (car IN ('carens', 'seltos')),
  adults          int  NOT NULL CHECK (adults >= 1),
  children        int  NOT NULL DEFAULT 0 CHECK (children >= 0),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  pickup_location text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  notified_at     timestamptz,
  notify_error    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date),
  -- Carens: max 6 adults, 7 people in total. Seltos: max 4 people.
  CONSTRAINT car_capacity CHECK (
    (car = 'carens' AND adults <= 6 AND adults + children <= 7) OR
    (car = 'seltos' AND adults + children <= 4)
  ),
  -- The database itself refuses two confirmed bookings of the same car on overlapping dates
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    car WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status = 'confirmed')
);

CREATE INDEX IF NOT EXISTS bookings_status_start_idx ON bookings (status, start_date);

-- Name of the dashboard user who last changed the status (added after the first release)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_by text;

-- Test data from `npm run db:seed`: never sent WhatsApp messages, removed by `npm run db:seed -- --clear`
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

-- Dashboard users: one super admin (the owner, created with `npm run super-admin -- create`),
-- plus the admins and viewers they add.
CREATE TABLE IF NOT EXISTS users (
  id              bigserial PRIMARY KEY,
  mobile          text NOT NULL UNIQUE CHECK (mobile ~ '^[6-9][0-9]{9}$'),
  name            text NOT NULL,
  role            text NOT NULL,
  password_hash   text NOT NULL,
  -- Increased on password change so existing sign-ins stop working
  session_version int  NOT NULL DEFAULT 1,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz
);

-- Who last changed the user (e.g. reset their password) and when
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by text;

-- Allowed roles (re-created each run so older databases pick up 'super_admin')
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'admin', 'viewer'));

-- At most one super admin
CREATE UNIQUE INDEX IF NOT EXISTS users_one_super_admin ON users ((true)) WHERE role = 'super_admin';

-- The super admin can't be deleted or have their role changed, whatever the app does
CREATE OR REPLACE FUNCTION protect_super_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'super_admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'super_admin') THEN
    RAISE EXCEPTION 'The super admin cannot be deleted or have their role changed'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS protect_super_admin ON users;

CREATE TRIGGER protect_super_admin BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_super_admin();

-- History of every change: who did what, when. Rows are only ever added, so deletions are recorded too.
CREATE TABLE IF NOT EXISTS activity_log (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_name   text NOT NULL,
  actor_mobile text,
  -- e.g. booking.confirmed, user.created, enquiry.created
  action       text NOT NULL,
  -- e.g. AN-1004, or "Ravi Kumar (9876500001)"
  target       text,
  details      text
);

CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at DESC);

-- Where each customer is in the WhatsApp booking conversation
CREATE TABLE IF NOT EXISTS wa_sessions (
  phone      text PRIMARY KEY,
  step       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- WhatsApp message IDs already handled (Meta can deliver the same message twice)
CREATE TABLE IF NOT EXISTS processed_messages (
  id          text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Which part of the dashboard an activity entry belongs to: 'cars' (bookings), 'print' (printout orders),
-- 'expenses' (Expense Tracker) or 'users' (team changes). Older entries are all car bookings or user changes.
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'cars';
UPDATE activity_log SET module = 'users' WHERE action LIKE 'user.%' AND module <> 'users';
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_module_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_module_check CHECK (module IN ('cars', 'print', 'users', 'expenses'));
CREATE INDEX IF NOT EXISTS activity_log_module_at_idx ON activity_log (module, at DESC);

-- ---------- Printout: customers scan the QR code at the counter and upload documents ----------

CREATE SEQUENCE IF NOT EXISTS print_order_no_seq START 1001;

-- One customer submission: one or more files, shown at the counter by its order number
CREATE TABLE IF NOT EXISTS print_orders (
  id            bigserial PRIMARY KEY,
  order_no      text NOT NULL UNIQUE DEFAULT ('P-' || nextval('print_order_no_seq')),
  -- Random id in the customer's confirmation link (order numbers are easy to guess)
  public_id     text NOT NULL UNIQUE,
  customer_name text,
  phone         text CHECK (phone IS NULL OR phone ~ '^[6-9][0-9]{9}$'),
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'printed', 'collected')),
  -- Keyed hash of the uploader's IP address, only used to limit how often one network can upload
  ip_hash       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text
);

CREATE INDEX IF NOT EXISTS print_orders_status_idx ON print_orders (status, created_at DESC);

-- Every upload slot handed out, used or not, so the files can be deleted after 3 days
CREATE TABLE IF NOT EXISTS print_uploads (
  storage_key  text PRIMARY KEY,
  content_type text NOT NULL,
  ip_hash      text,
  order_id     bigint REFERENCES print_orders (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS print_uploads_cleanup_idx ON print_uploads (created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS print_uploads_ip_idx ON print_uploads (ip_hash, created_at);

-- The files of an order, each with the customer's print options
CREATE TABLE IF NOT EXISTS print_files (
  id           bigserial PRIMARY KEY,
  order_id     bigint NOT NULL REFERENCES print_orders (id) ON DELETE CASCADE,
  position     int  NOT NULL,
  file_name    text NOT NULL,
  storage_key  text NOT NULL,
  content_type text NOT NULL,
  size_bytes   bigint NOT NULL,
  color        text NOT NULL CHECK (color IN ('bw', 'color')),
  sides        text NOT NULL CHECK (sides IN ('single', 'double')),
  copies       int  NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 99),
  -- e.g. "1-3, 5"; NULL means all pages (always NULL for images)
  page_range   text,
  printed_count int NOT NULL DEFAULT 0,
  printed_at   timestamptz,
  printed_by   text,
  -- Set when the file is removed from storage (3 days after upload)
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS print_files_order_idx ON print_files (order_id, position);

-- Who pressed "Delete files now" (NULL when the files were deleted automatically after 3 days)
ALTER TABLE print_files ADD COLUMN IF NOT EXISTS deleted_by text;

-- Files deleted with "Delete files now" before deleted_by existed: take the name from the activity log
UPDATE print_files f SET deleted_by = a.actor_name
FROM print_orders o, activity_log a
WHERE f.order_id = o.id AND f.deleted_by IS NULL AND f.deleted_at IS NOT NULL
  AND a.action = 'order.files_deleted' AND a.target = o.order_no
  AND a.at BETWEEN f.deleted_at - interval '2 minutes' AND f.deleted_at + interval '2 minutes';

-- Small app-wide switches, e.g. whether the print page accepts uploads
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- ---------- Expense Tracker: own vehicles, drivers, bookings, payments and running costs ----------
-- (Separate from the WhatsApp car bookings above.)

CREATE TABLE IF NOT EXISTS vehicles (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  -- Only cars for now
  kind        text NOT NULL DEFAULT 'car' CHECK (kind IN ('car')),
  -- Vehicles that have bookings are switched off instead of deleted, so old bookings keep their name
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  updated_at  timestamptz,
  updated_by  text
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_name_key ON vehicles (lower(name));

CREATE TABLE IF NOT EXISTS drivers (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  phone       text NOT NULL UNIQUE CHECK (phone ~ '^[6-9][0-9]{9}$'),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  updated_at  timestamptz,
  updated_by  text
);

CREATE SEQUENCE IF NOT EXISTS trip_no_seq START 1;

-- Booking numbers VB-0001, VB-0002, … (VB-10000 after VB-9999: never cut short)
CREATE OR REPLACE FUNCTION next_trip_no() RETURNS text LANGUAGE sql AS $$
  SELECT 'VB-' || lpad(n::text, greatest(4, length(n::text)), '0') FROM (SELECT nextval('trip_no_seq') AS n) s
$$;

-- One booking of a vehicle with a driver. "Upcoming", "on trip" and "completed" come from the dates.
CREATE TABLE IF NOT EXISTS trips (
  id              bigserial PRIMARY KEY,
  trip_no         text NOT NULL UNIQUE DEFAULT next_trip_no(),
  vehicle_id      bigint NOT NULL REFERENCES vehicles (id),
  driver_id       bigint NOT NULL REFERENCES drivers (id),
  customer_name   text NOT NULL,
  customer_phone  text NOT NULL CHECK (customer_phone ~ '^[6-9][0-9]{9}$'),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  pickup_state    text NOT NULL,
  pickup_city     text NOT NULL,
  drop_state      text NOT NULL,
  drop_city       text NOT NULL,
  -- Round trip: drop = pickup, and dest_* is where the vehicle went
  round_trip      boolean NOT NULL DEFAULT false,
  dest_state      text,
  dest_city       text,
  referrer_name   text,
  referrer_phone  text CHECK (referrer_phone IS NULL OR referrer_phone ~ '^[6-9][0-9]{9}$'),
  odometer_start  int CHECK (odometer_start >= 0),
  odometer_end    int,
  -- What the customer pays in total, and what the driver is owed for this booking
  total_amount    numeric(12, 2) CHECK (total_amount >= 0),
  driver_amount   numeric(12, 2) CHECK (driver_amount >= 0),
  notes           text,
  status          text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  updated_at      timestamptz,
  updated_by      text,
  CONSTRAINT trips_dates CHECK (end_date >= start_date),
  CONSTRAINT trips_odometer CHECK (odometer_end IS NULL OR (odometer_start IS NOT NULL AND odometer_end >= odometer_start)),
  CONSTRAINT trips_destination CHECK (NOT round_trip OR (dest_state IS NOT NULL AND dest_city IS NOT NULL)),
  -- The database itself refuses two bookings of the same vehicle on overlapping days
  CONSTRAINT trips_no_overlap EXCLUDE USING gist (
    vehicle_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status = 'booked')
);

CREATE INDEX IF NOT EXISTS trips_dates_idx ON trips (start_date DESC);
CREATE INDEX IF NOT EXISTS trips_driver_idx ON trips (driver_id, start_date);

-- Money received from the customer, or paid to the driver, for a booking
CREATE TABLE IF NOT EXISTS trip_payments (
  id          bigserial PRIMARY KEY,
  trip_id     bigint NOT NULL REFERENCES trips (id),
  party       text NOT NULL CHECK (party IN ('customer', 'driver')),
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  method      text NOT NULL CHECK (method IN ('cash', 'upi', 'bank', 'other')),
  -- When the money changed hands (can be set to an earlier time than when it was recorded)
  paid_at     timestamptz NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  -- Removed entries stay visible (crossed out), so the money history can't silently change
  deleted_at  timestamptz,
  deleted_by  text
);

CREATE INDEX IF NOT EXISTS trip_payments_trip_idx ON trip_payments (trip_id, paid_at);

-- Running costs of a vehicle: fuel filled, and repairs or servicing (engine oil, tyres…).
-- trip_id is set when the cost belongs to a booking.
CREATE TABLE IF NOT EXISTS vehicle_expenses (
  id          bigserial PRIMARY KEY,
  vehicle_id  bigint NOT NULL REFERENCES vehicles (id),
  trip_id     bigint REFERENCES trips (id),
  kind        text NOT NULL CHECK (kind IN ('fuel', 'repair')),
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  spent_on    date NOT NULL,
  -- Fuel: litres filled (optional). Repair: what was done.
  litres      numeric(8, 2) CHECK (litres > 0),
  description text,
  -- Repair: where it was done (typed by hand)
  shop_name   text,
  shop_state  text,
  shop_city   text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  deleted_at  timestamptz,
  deleted_by  text
);

CREATE INDEX IF NOT EXISTS vehicle_expenses_vehicle_idx ON vehicle_expenses (vehicle_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS vehicle_expenses_trip_idx ON vehicle_expenses (trip_id) WHERE trip_id IS NOT NULL;

-- A booking's own history on its page
CREATE INDEX IF NOT EXISTS activity_log_target_idx ON activity_log (module, target);

-- Databases made before 4-digit numbers used 'VB-' || nextval(…) here
ALTER TABLE trips ALTER COLUMN trip_no SET DEFAULT next_trip_no();

-- Expense Tracker test data from `npm run db:seed-expenses` (removed again with `-- --clear`)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE trip_payments ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE vehicle_expenses ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

-- Vehicle loan (EMI) and insurance details, kept on the vehicle
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS emi_amount numeric(12, 2) CHECK (emi_amount > 0);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS emi_lender text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS emi_day int CHECK (emi_day BETWEEN 1 AND 31);
-- First and last EMI months (stored as the 1st of the month)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS emi_start date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS emi_end date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_company text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_policy text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_premium numeric(12, 2) CHECK (insurance_premium > 0);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_from date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_to date;

-- EMI and insurance payments are vehicle costs too; an EMI payment says which month it's for
ALTER TABLE vehicle_expenses DROP CONSTRAINT IF EXISTS vehicle_expenses_kind_check;
ALTER TABLE vehicle_expenses ADD CONSTRAINT vehicle_expenses_kind_check CHECK (kind IN ('fuel', 'repair', 'emi', 'insurance'));
ALTER TABLE vehicle_expenses ADD COLUMN IF NOT EXISTS period date;
-- One EMI payment per vehicle per month (a removed one doesn't count)
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_expenses_emi_month ON vehicle_expenses (vehicle_id, period)
  WHERE kind = 'emi' AND deleted_at IS NULL;
