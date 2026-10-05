// Super admin setup and password recovery.
//
//   npm run super-admin -- create --name "Srimannarayana" --mobile 9949810683
//   npm run super-admin -- reset-password --mobile 9949810683
//
// Passwords are typed at a hidden prompt, so they never end up in your shell history.
// (`create --use-env-hash` takes an existing hash from ADMIN_PASSWORD_HASH instead.)
import { randomBytes, scryptSync } from "node:crypto";
import { connect, schemaSql } from "./db.mjs";

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--")) continue;
  const key = rest[i].slice(2);
  flags[key] = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function normalizeMobile(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

// When input is piped (not typed), read it all once and hand out one line per question
let pipedLines;
function readPipedLines() {
  return (pipedLines ??= new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.split(/\r?\n/)));
  }));
}

/** Reads a line without echoing it */
function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    if (!stdin.isTTY) {
      readPipedLines().then((lines) => {
        stdout.write("\n");
        resolve(lines.shift() ?? "");
      });
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(130); // Ctrl+C
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function askNewPassword() {
  const password = await askHidden("New password (8+ characters): ");
  if (password.length < 8) fail("Password must be at least 8 characters.");
  if ((await askHidden("Type it again: ")) !== password) fail("Passwords don't match.");
  return hashPassword(password);
}

const mobile = normalizeMobile(flags.mobile);
if (!["create", "reset-password"].includes(command) || !/^[6-9]\d{9}$/.test(mobile)) {
  console.log(`Usage:
  npm run super-admin -- create --name "Full Name" --mobile 9XXXXXXXXX
  npm run super-admin -- reset-password --mobile 9XXXXXXXXX`);
  process.exit(1);
}

const db = await connect();
await db.exec(schemaSql);

if (command === "create") {
  const name = typeof flags.name === "string" ? flags.name.trim() : "";
  if (name.length < 2) fail('Give a name: --name "Full Name"');

  const [existing] = await db.query(`SELECT name, mobile FROM users WHERE role = 'super_admin'`);
  if (existing) fail(`A super admin already exists: ${existing.name} (${existing.mobile}). Use reset-password if needed.`);
  const [taken] = await db.query(`SELECT role FROM users WHERE mobile = $1`, [mobile]);
  if (taken) fail(`${mobile} is already a ${taken.role}. Remove that user first.`);

  let hash;
  if (flags["use-env-hash"]) {
    hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash?.startsWith("scrypt:")) fail("ADMIN_PASSWORD_HASH is not set in .env.local.");
  } else {
    hash = await askNewPassword();
  }

  await db.query(
    `INSERT INTO users (name, mobile, role, password_hash, created_by) VALUES ($1, $2, 'super_admin', $3, 'setup')`,
    [name, mobile, hash],
  );
  await db.query(
    `INSERT INTO activity_log (actor_name, action, target, details) VALUES ('Command line', 'user.created', $1, 'Role: Super admin')`,
    [`${name} (${mobile})`],
  );
  console.log(`✓ ${name} (${mobile}) is now the super admin. Sign in at /login.`);
}

if (command === "reset-password") {
  const [user] = await db.query(`SELECT id::int AS id, name, role FROM users WHERE mobile = $1`, [mobile]);
  if (!user) fail(`No user with mobile ${mobile}.`);
  const hash = await askNewPassword();
  await db.query(
    `UPDATE users SET password_hash = $2, session_version = session_version + 1,
            updated_at = now(), updated_by = 'Command line'
     WHERE id = $1`,
    [user.id, hash],
  );
  await db.query(
    `INSERT INTO activity_log (actor_name, action, target, details) VALUES ('Command line', 'user.password_reset', $1, 'npm run super-admin -- reset-password')`,
    [`${user.name} (${mobile})`],
  );
  console.log(`✓ Password changed for ${user.name} (${user.role}). They've been signed out everywhere.`);
}

await db.close();
