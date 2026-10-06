import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import SubmitButton from "@/components/admin/SubmitButton";
import { can, requireUser, ROLE_LABELS, type Role } from "@/lib/auth";
import { formatPhone, initials } from "@/lib/format";
import { listUsers } from "@/lib/users";
import { readParams, type SearchParams } from "../filters";
import { createUserAction, deleteUserAction, resetPasswordAction } from "./actions";

export const metadata = { title: "Users & roles" };

const ROLE_INFO: { role: Role; icon: "crown" | "shield" | "eye"; points: string[] }[] = [
  {
    role: "super_admin",
    icon: "crown",
    points: ["Everything an admin can do", "Add admins and viewers", "Reset passwords", "Can't be removed"],
  },
  {
    role: "admin",
    icon: "shield",
    points: ["Print orders, mark them collected", "Mark enquiries as booked or rejected", "Remove users (not the super admin)"],
  },
  {
    role: "viewer",
    icon: "eye",
    points: ["See print orders and open files", "See bookings and calendar", "Can't change anything"],
  },
];

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser("viewUsers");
  const params = await readParams(searchParams);
  const users = await listUsers();
  const canCreate = can(me, "createUsers");
  const canDelete = can(me, "deleteUsers");
  const canReset = can(me, "resetPasswords");

  return (
    <main className="ap-page">
      <PageHeader title="Users & roles" subtitle="Who can sign in to this dashboard, and what they're allowed to do." />
      <Flash params={params} />

      <section className="ap-roles">
        {ROLE_INFO.map((r) => (
          <div key={r.role} className={`ap-role-card is-${r.role}`}>
            <span className="ap-role-icon">
              <Icon name={r.icon} size={18} />
            </span>
            <strong>{ROLE_LABELS[r.role]}</strong>
            <ul>
              {r.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <div className={canCreate ? "ap-grid-users" : ""}>
        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Team</h2>
            <span className="ap-muted">
              {users.length} {users.length === 1 ? "person" : "people"}
            </span>
          </div>

          <ul className="ap-users">
            {users.map((u) => {
              const isMe = u.id === me.id;
              const isSuper = u.role === "super_admin";
              const showReset = canReset && !isSuper;
              const showDelete = canDelete && !isMe && !isSuper;
              return (
                <li key={u.id} className="ap-user">
                  <span className={`ap-avatar ${isSuper ? "is-owner" : ""}`}>{initials(u.name)}</span>
                  <div className="ap-user-main">
                    <strong>
                      {u.name} {isMe && <span className="ap-you">You</span>}
                    </strong>
                    <span>{formatPhone(u.mobile)}</span>
                  </div>
                  <span className={`ap-role is-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                  <span className="ap-user-meta">
                    {u.last_login_ist ? `Last sign-in ${u.last_login_ist}` : "Never signed in"}
                    <br />
                    {isSuper ? "Owner · can't be removed" : `Added ${u.created_ist}${u.created_by ? ` by ${u.created_by}` : ""}`}
                    {u.updated_ist && (
                      <>
                        <br />
                        Password changed {u.updated_ist}
                        {u.updated_by ? ` by ${u.updated_by}` : ""}
                      </>
                    )}
                  </span>

                  {(showReset || showDelete) && (
                    <div className="ap-user-actions">
                      {showReset && (
                        <details className="ap-reset">
                          <summary className="ap-btn ap-btn-ghost ap-btn-sm">
                            <Icon name="key" size={14} /> Reset password
                          </summary>
                          <form action={resetPasswordAction} className="ap-reset-form">
                            <input type="hidden" name="id" value={u.id} />
                            <input
                              type="password"
                              name="password"
                              minLength={8}
                              required
                              placeholder="New password (8+ characters)"
                              autoComplete="new-password"
                            />
                            <SubmitButton className="ap-btn ap-btn-gold ap-btn-sm">Save</SubmitButton>
                          </form>
                        </details>
                      )}
                      {showDelete && (
                        <form action={deleteUserAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <SubmitButton
                            className="ap-btn ap-btn-danger ap-btn-sm"
                            confirm={`Remove ${u.name}? They will be signed out and can no longer access the dashboard.`}
                          >
                            <Icon name="trash" size={14} /> Remove
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {users.length === 1 && (
            <p className="ap-empty-sm">
              {canCreate ? "No other users yet. Add an admin or a viewer using the form." : "No other users yet."}
            </p>
          )}
          {!canCreate && <p className="ap-hint">Only the super admin can add users or reset passwords.</p>}
        </section>

        {canCreate && (
          <section className="ap-panel ap-create">
            <div className="ap-panel-head">
              <h2>Add a user</h2>
            </div>
            <form action={createUserAction}>
              <label className="ap-field">
                <span>Full name</span>
                <input name="name" required minLength={2} maxLength={60} autoComplete="off" placeholder="e.g. Ravi Kumar" />
              </label>
              <label className="ap-field">
                <span>Mobile number</span>
                <input
                  type="tel"
                  name="mobile"
                  inputMode="numeric"
                  required
                  maxLength={16}
                  autoComplete="off"
                  placeholder="10-digit mobile number"
                />
              </label>
              <fieldset className="ap-field ap-rolepick">
                <span>Role</span>
                <label>
                  <input type="radio" name="role" value="viewer" defaultChecked />
                  <span>
                    <Icon name="eye" size={16} />
                    <strong>Viewer</strong>
                    <small>Can only look</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="role" value="admin" />
                  <span>
                    <Icon name="shield" size={16} />
                    <strong>Admin</strong>
                    <small>Manages bookings</small>
                  </span>
                </label>
              </fieldset>
              <label className="ap-field">
                <span>Password</span>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </label>
              <SubmitButton className="ap-btn ap-btn-gold ap-btn-block">
                <Icon name="plus" size={16} /> Add user
              </SubmitButton>
              <p className="ap-hint">Share the password with them privately. They sign in at /login with their mobile number.</p>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
