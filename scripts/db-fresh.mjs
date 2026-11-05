// Wipes the LOCAL database and fills it with sample data and three sign-ins: npm run db:fresh
//
// Only runs on a database on this computer (Docker or PGlite). It refuses to run if DATABASE_URL
// points at Neon, so the real data can never be wiped by it.
import { execFileSync } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connect, databaseKind, describeTarget, requireLocal, schemaSql } from "./db.mjs";

requireLocal("wipe the database");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see README.md).");
  process.exit(1);
}
console.log(`Starting fresh: ${describeTarget()}`);

// Sign-ins for trying every role (local only, so the passwords can be simple).
// The super admin's password can be set in .env.local (LOCAL_SUPER_ADMIN_PASSWORD), so it stays out of git.
const superAdminPassword = process.env.LOCAL_SUPER_ADMIN_PASSWORD || "testpass123";
const USERS = [
  { name: "Srimannarayana", mobile: "9949810683", role: "super_admin", password: superAdminPassword },
  { name: "Kiran Admin", mobile: "9876500011", role: "admin", password: "adminpass1" },
  { name: "Latha Viewer", mobile: "9876500022", role: "viewer", password: "viewpass1" },
];
const hash = (password) => {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
};

if (databaseKind(url) === "pglite") {
  // A PGlite database is a folder: remove it (the dev server must be stopped)
  rmSync(url.slice("pglite:".length) || "./.data/pglite", { recursive: true, force: true });
}

const db = await connect();
if (databaseKind(url) === "docker") {
  // Every table, row and function goes; schema.sql then builds them again
  await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}
await db.exec(schemaSql);
for (const u of USERS) {
  const superAdmin = u.role === "super_admin";
  await db.query(`INSERT INTO users (name, mobile, role, password_hash, created_by) VALUES ($1, $2, $3, $4, $5)`, [
    u.name,
    u.mobile,
    u.role,
    hash(u.password),
    superAdmin ? "setup" : USERS[0].name,
  ]);
  // Logged like the real setup (npm run super-admin) and adding a user in the app
  await db.query(`INSERT INTO activity_log (actor_name, action, module, target, details) VALUES ($1, 'user.created', 'users', $2, $3)`, [
    superAdmin ? "Command line" : USERS[0].name,
    `${u.name} (${u.mobile})`,
    `Role: ${{ super_admin: "Super admin", admin: "Admin", viewer: "Viewer" }[u.role]}`,
  ]);
}
await db.close();
console.log("✓ Empty tables and three sign-ins are ready.");

// The sample data scripts, with the same DATABASE_URL
for (const script of ["seed.mjs", "seed-expenses.mjs"]) {
  execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    stdio: "inherit",
    env: process.env,
  });
}

console.log("\nSign in at http://localhost:3000/login with:");
for (const u of USERS) {
  const shown = u.role === "super_admin" && process.env.LOCAL_SUPER_ADMIN_PASSWORD ? "(LOCAL_SUPER_ADMIN_PASSWORD in .env.local)" : u.password;
  console.log(`  ${u.role.padEnd(11)} ${u.mobile}  ${shown}   (${u.name})`);
}
