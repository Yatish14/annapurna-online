import Flash from "@/components/admin/Flash";
import PageHeader from "@/components/admin/PageHeader";
import SubmitButton from "@/components/admin/SubmitButton";
import { requireUser, ROLE_LABELS } from "@/lib/auth";
import { formatPhone, initials } from "@/lib/format";
import { readParams, type SearchParams } from "../filters";
import { changeOwnPassword } from "./actions";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const params = await readParams(searchParams);

  return (
    <main className="ad-page">
      <PageHeader title="My account" subtitle="Your sign-in details." />
      <Flash params={params} />

      <div className="ad-grid-account">
        <section className="ad-panel ad-profile">
          <span className={`ad-avatar ad-avatar-lg ${me.role === "super_admin" ? "is-owner" : ""}`}>{initials(me.name)}</span>
          <strong>{me.name}</strong>
          <span className="ad-muted">{formatPhone(me.mobile)}</span>
          <span className={`ad-role is-${me.role}`}>{ROLE_LABELS[me.role]}</span>
        </section>

        <section className="ad-panel">
          <div className="ad-panel-head">
            <h2>Change password</h2>
          </div>
          <form action={changeOwnPassword} className="ad-account-form">
            <label className="ad-field">
              <span>Current password</span>
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label className="ad-field">
              <span>New password</span>
              <input type="password" name="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
            </label>
            <label className="ad-field">
              <span>Type the new password again</span>
              <input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
            </label>
            <SubmitButton className="ad-btn ad-btn-gold">Update password</SubmitButton>
            <p className="ad-hint">You'll stay signed in here; any other devices will be signed out.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
