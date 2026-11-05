import { neon } from "@neondatabase/serverless";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

type Row = Record<string, unknown>;
type QueryFn = (text: string, params: unknown[]) => Promise<Row[]>;

// One connection per server process (also survives dev hot reloads)
const cache = globalThis as unknown as { __annapurnaDb?: Promise<QueryFn> };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Which database DATABASE_URL points at:
 * "docker"  a Postgres on this computer (docker-compose.yml), e.g. postgresql://…@localhost:5432/annapurna
 * "pglite"  an in-process Postgres stored in a folder (the automated tests)
 * "neon"    anything else: the real data
 */
export function databaseKind(url = process.env.DATABASE_URL ?? ""): "docker" | "pglite" | "neon" {
  if (url.startsWith("pglite:")) return "pglite";
  try {
    const u = new URL(url);
    if (/^postgres(ql)?:$/.test(u.protocol) && LOCAL_HOSTS.has(u.hostname)) return "docker";
  } catch {
    // not a URL: treated as Neon, which then reports the problem
  }
  return "neon";
}

async function connect(): Promise<QueryFn> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see README.md");
  const kind = databaseKind(url);

  // Local development: the Postgres in Docker. Neon's driver only talks to Neon, so this uses
  // the standard Postgres driver (a dev dependency, never used on the live site).
  if (kind === "docker") {
    const { Pool } = (await import("pg")).default;
    const pool = new Pool({ connectionString: url, max: 5 });
    await pool.query(await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
    return async (text, params) => (await pool.query(text, params)).rows as Row[];
  }

  // Automated tests: an in-process Postgres stored in a folder, e.g. "pglite:./.data/pglite"
  if (kind === "pglite") {
    const { PGlite } = await import("@electric-sql/pglite");
    const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
    const dir = url.slice("pglite:".length) || "./.data/pglite";
    await mkdir(dir, { recursive: true }); // PGlite doesn't create missing parent folders
    const db = await PGlite.create(dir, { extensions: { btree_gist } });
    await db.exec(await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
    return async (text, params) => (await db.query<Row>(text, params)).rows;
  }

  const sql = neon(url);
  return async (text, params) => (await sql.query(text, params)) as Row[];
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  cache.__annapurnaDb ??= connect().catch((err) => {
    cache.__annapurnaDb = undefined;
    throw err;
  });
  const run = await cache.__annapurnaDb;
  return (await run(text, params)) as T[];
}

/** Postgres error code, if the error came from the database */
export function dbErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

export const EXCLUSION_VIOLATION = "23P01";
