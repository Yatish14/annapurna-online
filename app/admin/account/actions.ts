"use server";

import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { hashPassword, requireUser, setSessionCookie, verifyPassword } from "@/lib/auth";
import { getUser, setPassword } from "@/lib/users";
import { withFlash } from "../filters";

const BACK = "/admin/account";

/** Any signed-in user: change your own password (needs the current one) */
export async function changeOwnPassword(formData: FormData) {
  const me = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await getUser(me.id);
  if (!user || !verifyPassword(current, user.password_hash)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    redirect(withFlash(BACK, "wrong-password"));
  }
  if (next.length < 8) redirect(withFlash(BACK, "user-password"));
  if (next !== confirm) redirect(withFlash(BACK, "password-mismatch"));

  const version = await setPassword(user.id, hashPassword(next), user.name);
  await logActivity(me, "user.password_changed", `${user.name} (${user.mobile})`);
  // Other devices are signed out; keep this one signed in with the new session version
  if (version !== null) await setSessionCookie(user.mobile, version);
  redirect(withFlash(BACK, "password-changed"));
}
