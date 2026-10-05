import { neon } from "@neondatabase/serverless";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

type Row = Record<string, unknown>;
type QueryFn = (text: string, params: unknown[]) => Promise<Row[]>;

// One connection per server process (also survives dev hot reloads)
const cache = globalThis as unknown as { __annapurnaDb?: Promise<QueryFn> };

async function connect(): Promise<QueryFn> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see README.md");

  // Local development: an in-process Postgres stored in a folder, e.g. "pglite:./.data/pglite"
  if (url.startsWith("pglite:")) {
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
