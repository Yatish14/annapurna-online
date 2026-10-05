"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { hashPassword, isValidMobile, normalizeMobile, requireUser, ROLE_LABELS } from "@/lib/auth";
import { createUser, deleteUser, getUser, setPassword } from "@/lib/users";
import { withFlash } from "../filters";

const BACK = "/admin/users";
const MIN_PASSWORD = 8;

const who = (u: { name: string; mobile: string }) => `${u.name} (${u.mobile})`;

/** Super admin only: add an admin or a viewer */
export async function createUserAction(formData: FormData) {
  const actor = await requireUser("createUsers");

  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  const mobile = normalizeMobile(String(formData.get("mobile") ?? ""));
  const role = String(formData.get("role"));
  const password = String(formData.get("password") ?? "");

  if (name.length < 2 || name.length > 60) redirect(withFlash(BACK, "user-name"));
  if (!isValidMobile(mobile)) redirect(withFlash(BACK, "user-mobile"));
  // There is only ever one super admin, created from the command line
  if (role !== "admin" && role !== "viewer") redirect(withFlash(BACK, "invalid"));
  if (password.length < MIN_PASSWORD) redirect(withFlash(BACK, "user-password"));

  const result = await createUser({ name, mobile, role, passwordHash: hashPassword(password), createdBy: actor.name });
  if (result === "exists") redirect(withFlash(BACK, "user-exists"));

  await logActivity(actor, "user.created", who({ name, mobile }), `Role: ${ROLE_LABELS[role]}`);
  revalidatePath(BACK);
  redirect(withFlash(BACK, "user-created", name));
}

/** Admins and the super admin: remove any user except the super admin and themselves */
export async function deleteUserAction(formData: FormData) {
  const actor = await requireUser("deleteUsers");

  const target = await getUser(Number(formData.get("id")));
  if (!target) redirect(withFlash(BACK, "not-found"));
  if (target.role === "super_admin") redirect(withFlash(BACK, "user-protected"));
  if (target.id === actor.id) redirect(withFlash(BACK, "user-self"));

  if (!(await deleteUser(target.id))) redirect(withFlash(BACK, "not-found"));
  await logActivity(actor, "user.deleted", who(target), `Role: ${ROLE_LABELS[target.role]}`);
  revalidatePath(BACK);
  redirect(withFlash(BACK, "user-deleted", target.name));
}

/** Super admin only: set a new password for an admin or viewer (signs them out everywhere) */
export async function resetPasswordAction(formData: FormData) {
  const actor = await requireUser("resetPasswords");

  const target = await getUser(Number(formData.get("id")));
  if (!target) redirect(withFlash(BACK, "not-found"));
  // Your own password is changed on the My account page, which checks the current one
  if (target.role === "super_admin") redirect(withFlash(BACK, "invalid"));
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) redirect(withFlash(BACK, "user-password"));

  await setPassword(target.id, hashPassword(password), actor.name);
  await logActivity(actor, "user.password_reset", who(target));
  revalidatePath(BACK);
  redirect(withFlash(BACK, "password-reset", target.name));
}
