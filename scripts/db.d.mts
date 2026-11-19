// Types for scripts/db.mjs, so the TypeScript scripts (scripts/kb-*.ts, evals/) can use its connection too
export const schemaSql: string;
export function splitStatements(script: string): string[];
export function databaseKind(url?: string): "docker" | "pglite" | "neon";
export function describeTarget(): string;
export function requireLocal(what: string): void;
export type ScriptDb = {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
};
export function connect(): Promise<ScriptDb>;
