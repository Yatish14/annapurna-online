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
    <main className="ad-login">
      <form action={login} className="ad-login-card">
        <div className="ad-login-brand">
          <Lotus size={44} />
          <div>
            <strong>Annapurna</strong>
            <span>Bookings dashboard</span>
          </div>
        </div>

        <h1>Sign in</h1>
        {error && ERRORS[error] && <p className="ad-alert ad-alert-error">{ERRORS[error]}</p>}

        <label className="ad-field">
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
        <label className="ad-field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>

        <SubmitButton className="ad-btn ad-btn-gold ad-btn-block">Sign in</SubmitButton>
      </form>
    </main>
  );
}
