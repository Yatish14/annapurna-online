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
    <main className="ap-page">
      <PageHeader title="My account" subtitle="Your sign-in details." />
      <Flash params={params} />

      <div className="ap-grid-account">
        <section className="ap-panel ap-profile">
          <span className={`ap-avatar ap-avatar-lg ${me.role === "super_admin" ? "is-owner" : ""}`}>{initials(me.name)}</span>
          <strong>{me.name}</strong>
          <span className="ap-muted">{formatPhone(me.mobile)}</span>
          <span className={`ap-role is-${me.role}`}>{ROLE_LABELS[me.role]}</span>
        </section>

        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Change password</h2>
          </div>
          <form action={changeOwnPassword} className="ap-account-form">
            <label className="ap-field">
              <span>Current password</span>
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label className="ap-field">
              <span>New password</span>
              <input type="password" name="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
            </label>
            <label className="ap-field">
              <span>Type the new password again</span>
              <input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
            </label>
            <SubmitButton className="ap-btn ap-btn-gold">Update password</SubmitButton>
            <p className="ap-hint">You'll stay signed in here; any other devices will be signed out.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
