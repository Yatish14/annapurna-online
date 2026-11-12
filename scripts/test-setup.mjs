// Prepares the database for the automated tests (playwright.config.ts runs this before the test server starts):
// a fresh PGlite database in .data/pglite-test, the tables, and one sign-in for each role.
// Never touches the Docker database or Neon: it refuses unless DATABASE_URL is the PGlite test folder.
import { randomBytes, scryptSync } from "node:crypto";
import { rmSync } from "node:fs";
import { connect, schemaSql } from "./db.mjs";

export const TEST_DB = "pglite:./.data/pglite-test";

if (process.env.DATABASE_URL !== TEST_DB) {
  console.error(`✗ Refusing to reset the database: DATABASE_URL must be ${TEST_DB} for the tests.`);
  process.exit(1);
}

/** Same format as lib/auth.ts and scripts/super-admin.mjs */
function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

// The sign-ins the tests use (tests/users.ts has the same numbers). Test data only: never real people.
const USERS = [
  { mobile: "9000000001", name: "Test Owner", role: "super_admin" },
  { mobile: "9000000002", name: "Test Admin", role: "admin" },
  { mobile: "9000000003", name: "Test Viewer", role: "viewer" },
];
const PASSWORD = "test-password-123";

rmSync("./.data/pglite-test", { recursive: true, force: true }); // start from nothing, every run
const db = await connect();
await db.exec(schemaSql);
for (const u of USERS) {
  await db.query("INSERT INTO users (mobile, name, role, password_hash, created_by) VALUES ($1, $2, $3, $4, 'tests')", [
    u.mobile,
    u.name,
    u.role,
    hashPassword(PASSWORD),
  ]);
}
// Bookings for the assistant's tools to find (tests/assistant.spec.ts). Dates are counted from today in India,
// so "upcoming" stays upcoming whenever the tests run.
const [car] = await db.query("INSERT INTO vehicles (name, created_by) VALUES ('Test Carens', 'tests') RETURNING id::int");
const [driver] = await db.query(
  "INSERT INTO drivers (name, phone, created_by) VALUES ('Test Driver', '9000000009', 'tests') RETURNING id::int",
);
const BOOKINGS = [
  // [customer, starts in N days, lasts N days, total]
  ["Test Customer One", 3, 2, 12000],
  ["Test Customer Two", 10, 1, 6000],
];
for (const [customer, inDays, days, total] of BOOKINGS) {
  await db.query(
    `INSERT INTO trips (vehicle_id, driver_id, customer_name, customer_phone, start_date, end_date,
                        pickup_state, pickup_city, drop_state, drop_city, total_amount, created_by)
     VALUES ($1, $2, $3, '9000000010', (now() AT TIME ZONE 'Asia/Kolkata')::date + $4::int,
             (now() AT TIME ZONE 'Asia/Kolkata')::date + $4::int + $5::int - 1,
             'Andhra Pradesh', 'Vijayawada', 'Andhra Pradesh', 'Guntur', $6, 'tests')`,
    [car.id, driver.id, customer, inDays, days, total],
  );
}
await db.close();
console.log(`✓ Test database ready with ${USERS.length} sign-ins and ${BOOKINGS.length} bookings.`);
