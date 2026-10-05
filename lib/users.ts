import type { Role } from "./config";
import { dbErrorCode, query } from "./db";

export type UserRow = {
  id: number;
  mobile: string;
  name: string;
  role: Role;
  password_hash: string;
  session_version: number;
  created_by: string | null;
  created_ist: string;
  updated_by: string | null;
  updated_ist: string | null;
  last_login_ist: string | null;
};

const COLUMNS = `
  id::int AS id, mobile, name, role, password_hash, session_version, created_by, updated_by,
  to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') AS created_ist,
  to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') AS updated_ist,
  to_char(last_login_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS last_login_ist`;

export async function findUserByMobile(mobile: string): Promise<UserRow | null> {
  const [row] = await query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE mobile = $1`, [mobile]);
  return row ?? null;
}

export async function getUser(id: number): Promise<UserRow | null> {
  const [row] = await query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return row ?? null;
}

/** Super admin first, then admins, then viewers */
export async function listUsers(): Promise<UserRow[]> {
  return query<UserRow>(
    `SELECT ${COLUMNS} FROM users
     ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, name`,
  );
}

export async function hasSuperAdmin(): Promise<boolean> {
  const rows = await query(`SELECT 1 FROM users WHERE role = 'super_admin'`);
  return rows.length > 0;
}

export async function createUser(u: {
  name: string;
  mobile: string;
  role: "admin" | "viewer";
  passwordHash: string;
  createdBy: string;
}): Promise<"created" | "exists"> {
  try {
    await query(
      `INSERT INTO users (name, mobile, role, password_hash, created_by) VALUES ($1, $2, $3, $4, $5)`,
      [u.name, u.mobile, u.role, u.passwordHash, u.createdBy],
    );
    return "created";
  } catch (err) {
    if (dbErrorCode(err) === "23505") return "exists"; // mobile already used
    throw err;
  }
}

/** Never deletes the super admin (the database refuses it as well) */
export async function deleteUser(id: number): Promise<boolean> {
  const rows = await query(`DELETE FROM users WHERE id = $1 AND role <> 'super_admin' RETURNING id`, [id]);
  return rows.length > 0;
}

/** Sets a new password and signs the user out everywhere. Returns the new session version. */
export async function setPassword(id: number, passwordHash: string, changedBy: string): Promise<number | null> {
  const [row] = await query<{ session_version: number }>(
    `UPDATE users
     SET password_hash = $2, session_version = session_version + 1, updated_at = now(), updated_by = $3
     WHERE id = $1 RETURNING session_version`,
    [id, passwordHash, changedBy],
  );
  return row?.session_version ?? null;
}

export async function touchLogin(id: number): Promise<void> {
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);
}
