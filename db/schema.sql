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
