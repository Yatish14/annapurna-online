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

export async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see README.md).");
    process.exit(1);
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
