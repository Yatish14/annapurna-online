import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Lotus from "@/components/admin/Lotus";
import SubmitButton from "@/components/admin/SubmitButton";
import { currentUser } from "@/lib/auth";
import { login } from "./actions";
import "../admin.css";

export const metadata: Metadata = {
  title: "Sign in · Annapurna",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  "1": "Incorrect mobile number or password.",
  setup: "Login isn't set up yet: SESSION_SECRET must be set (see README).",
  "no-users": 'No super admin yet. Create one with: npm run super-admin -- create --name "Your Name" --mobile <number>',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="ap-login">
      <form action={login} className="ap-login-card">
        <div className="ap-login-brand">
          <Lotus size={44} />
          <div>
            <strong>Annapurna</strong>
            <span>Bookings dashboard</span>
          </div>
        </div>

        <h1>Sign in</h1>
        {error && ERRORS[error] && <p className="ap-alert ap-alert-error">{ERRORS[error]}</p>}

        <label className="ap-field">
          <span>Mobile number</span>
          <input
            type="tel"
            name="mobile"
            inputMode="numeric"
            autoComplete="username"
            placeholder="10-digit mobile number"
            maxLength={16}
            required
            autoFocus
          />
        </label>
        <label className="ap-field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>

        <SubmitButton className="ap-btn ap-btn-gold ap-btn-block">Sign in</SubmitButton>
      </form>
    </main>
  );
}
