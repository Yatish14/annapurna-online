// Database connection for the command-line scripts (same DATABASE_URL rules as lib/db.ts).
import { neon } from "@neondatabase/serverless";
import { mkdirSync, readFileSync } from "node:fs";

export const schemaSql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

/** Splits a SQL script at lines ending in ";", keeping $$ … $$ function bodies whole */
export function splitStatements(script) {
  const statements = [];
  let current = [];
  let inBody = false;
  for (const line of script.split("\n")) {
    if (!inBody && /^\s*--/.test(line)) continue;
    current.push(line);
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inBody = !inBody;
    if (!inBody && /;\s*$/.test(line)) {
      statements.push(current.join("\n").trim().replace(/;$/, ""));
      current = [];
    }
  }
  const rest = current.join("\n").trim();
  if (rest) statements.push(rest);
  return statements.filter(Boolean);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** "docker" (Postgres on this computer), "pglite" (a folder, for the tests) or "neon" (the real data) */
export function databaseKind(url = process.env.DATABASE_URL ?? "") {
  if (url.startsWith("pglite:")) return "pglite";
  try {
    const u = new URL(url);
    if (/^postgres(ql)?:$/.test(u.protocol) && LOCAL_HOSTS.has(u.hostname)) return "docker";
  } catch {
    // not a URL: treated as Neon
  }
  return "neon";
}

const KIND_LABELS = { docker: "the local database (Docker)", pglite: "the local test database (PGlite)", neon: "NEON, the real data" };

/** Says which database a script is about to use */
export function describeTarget() {
  return KIND_LABELS[databaseKind()];
}

/**
 * Stops a script that adds sample data or wipes tables unless the database is on this computer,
 * so it can never touch the real data on Neon.
 */
export function requireLocal(what) {
  if (!process.env.DATABASE_URL) return; // connect() reports it
  if (databaseKind() !== "neon") return;
  console.error(`✗ Refusing to ${what}: DATABASE_URL points at Neon (the real data).`);
  console.error("  This only runs on a database on this computer. See \"Local database\" in README.md.");
  process.exit(1);
}

export async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see README.md).");
    process.exit(1);
  }

  if (databaseKind(url) === "docker") {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url, max: 2 });
    return {
      exec: (sql) => pool.query(sql),
      query: async (text, params = []) => (await pool.query(text, params)).rows,
      close: () => pool.end(),
    };
  }

  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
    const dir = url.slice("pglite:".length) || "./.data/pglite";
    mkdirSync(dir, { recursive: true }); // PGlite doesn't create missing parent folders
    const db = await PGlite.create(dir, { extensions: { btree_gist } });
    return {
      exec: (sql) => db.exec(sql),
      query: async (text, params = []) => (await db.query(text, params)).rows,
      close: () => db.close(),
    };
  }

  const sql = neon(url);
  return {
    // Neon's HTTP driver runs one statement per request
    exec: async (script) => {
      for (const statement of splitStatements(script)) await sql.query(statement);
    },
    query: (text, params = []) => sql.query(text, params),
    close: async () => {},
  };
}
