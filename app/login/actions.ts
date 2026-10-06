"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, SESSION_COOKIE, setSessionCookie } from "@/lib/auth";

export async function login(formData: FormData) {
  const mobile = String(formData.get("mobile") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!process.env.SESSION_SECRET) redirect("/login?error=setup");

  const result = await authenticate(mobile, password);
  if (!result.ok) {
    if (result.reason === "setup") redirect("/login?error=no-users");
    // Slow down password guessing
    await new Promise((resolve) => setTimeout(resolve, 800));
    redirect("/login?error=1");
  }

  await setSessionCookie(result.mobile, result.version);
  redirect("/admin/print");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
