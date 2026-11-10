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
await db.close();
console.log(`✓ Test database ready with ${USERS.length} sign-ins.`);
