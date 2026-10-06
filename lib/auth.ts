import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "./config";
import { findUserByMobile, hasSuperAdmin, touchLogin } from "./users";

export type { Role };

export const SESSION_COOKIE = "ap_session";
export const SESSION_DAYS = 7;

// ---------- Roles & permissions ----------

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  viewer: "Viewer",
};

const PERMISSIONS = {
  /** Mark as booked, reject, cancel, resend messages */
  manageBookings: ["super_admin", "admin"],
  /** Print customers' files, mark orders collected, pause or resume uploads */
  managePrints: ["super_admin", "admin"],
  viewUsers: ["super_admin", "admin"],
  /** The activity log: who changed what, when */
  viewActivity: ["super_admin", "admin"],
  deleteUsers: ["super_admin", "admin"],
  createUsers: ["super_admin"],
  resetPasswords: ["super_admin"],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(user: { role: Role } | null, permission: Permission): boolean {
  return Boolean(user) && (PERMISSIONS[permission] as Role[]).includes(user!.role);
}

export type SessionUser = { id: number; mobile: string; name: string; role: Role };

// ---------- Passwords ----------

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "scrypt:<salt hex>:<hash hex>" — same format as scripts/super-admin.mjs */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return safeEqual(actual, expected);
}

let dummyHash: string | undefined;

/** "+91 99498-10683", "099498 10683" … → "9949810683" */
export function normalizeMobile(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile);
}

export type LoginResult = { ok: true; mobile: string; version: number } | { ok: false; reason: "invalid" | "setup" };

export async function authenticate(mobileInput: string, password: string): Promise<LoginResult> {
  const mobile = normalizeMobile(mobileInput);

  const user = isValidMobile(mobile) ? await findUserByMobile(mobile) : null;
  if (!user) {
    // Same amount of work as a real check, so unknown numbers can't be detected by timing
    verifyPassword(password, (dummyHash ??= hashPassword("not-a-real-password")));
    // A brand-new database has nobody to sign in as yet
    return { ok: false, reason: (await hasSuperAdmin()) ? "invalid" : "setup" };
  }
  if (!verifyPassword(password, user.password_hash)) return { ok: false, reason: "invalid" };
  await touchLogin(user.id);
  return { ok: true, mobile, version: user.session_version };
}

// ---------- Session cookie ----------

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters) — see README.md");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Session token: base64url({u: mobile, v: session version, exp}).signature */
export function createSessionToken(mobile: string, version: number): string {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ u: mobile, v: version, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Signs the browser in (call from a server action) */
export async function setSessionCookie(mobile: string, version: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(mobile, version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

function readSessionToken(token: string | undefined): { mobile: string; version: number } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  try {
    const { u, v, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof u !== "string" || typeof v !== "number" || typeof exp !== "number" || exp < Date.now()) return null;
    return { mobile: u, version: v };
  } catch {
    return null;
  }
}

/**
 * The signed-in user, checked against the database on every request, so deleted users
 * and users whose password was reset are signed out straight away.
 * Cached per request (the layout and the page both ask).
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const session = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const user = await findUserByMobile(session.mobile);
  if (!user || user.session_version !== session.version) return null;
  return { id: user.id, mobile: user.mobile, name: user.name, role: user.role };
});

/** Sends visitors who aren't signed in to /login, and users without the permission to the dashboard home */
export async function requireUser(permission?: Permission): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (permission && !can(user, permission)) redirect("/admin/print?flash=forbidden");
  return user;
}
