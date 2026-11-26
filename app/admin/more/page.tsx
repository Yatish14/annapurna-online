import Link from "next/link";
import { logout } from "@/app/login/actions";
import Icon, { type IconName } from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { NAV_MODULES, TABS } from "@/components/admin/nav";
import { can, requireUser, ROLE_LABELS } from "@/lib/auth";
import { formatPhone, initials } from "@/lib/format";
import { lock, LOCKED } from "@/lib/viewOnly";

export const metadata = { title: "More" };

/** Phones: every page that isn't a bottom tab, grouped like the desktop sidebar. Replaces the old ☰ drawer. */
export default async function MorePage() {
  const me = await requireUser();
  const tabs = new Set(TABS.map((t) => t.href));
  const settings: Row[] = [
    { href: "/admin/users", label: "Users & roles", icon: "users", locked: can(me, "viewUsers") ? undefined : LOCKED.users },
    // Only the super admin can open the usage page, so only they see the link (same as the Assist page header)
    ...(can(me, "viewAssistantUsage") ? [{ href: "/admin/assistant/usage", label: "Assist usage", icon: "chart" as const }] : []),
    { href: "/admin/account", label: "My account", icon: "key", note: "Change your password" },
  ];

  return (
    <main className="ap-page mo-page">
      <PageHeader title="More" />

      <Link href="/admin/account" className="mo-me">
        <span className={`ap-avatar ${me.role === "super_admin" ? "is-owner" : ""}`}>{initials(me.name)}</span>
        <span className="mo-me-text">
          <strong>{me.name}</strong>
          <span>
            {ROLE_LABELS[me.role]} · {formatPhone(me.mobile)}
          </span>
        </span>
        <LinkPending>
          <Icon name="chevron" />
        </LinkPending>
      </Link>

      {NAV_MODULES.map((m) => (
        <Group key={m.id} title={m.label}>
          {m.items
            .filter((i) => !tabs.has(i.href))
            .map((i) => (
              <MoreRow key={i.href} {...i} locked={i.lock === "activity" && !can(me, "viewActivity") ? LOCKED.activity : undefined} />
            ))}
        </Group>
      ))}

      <Group title="Settings">
        {settings.map((r) => (
          <MoreRow key={r.href} {...r} />
        ))}
        <form action={logout}>
          <button type="submit" className="mo-row mo-signout">
            <span className="mo-tile">
              <Icon name="logout" />
            </span>
            <span className="mo-text">
              <strong>Sign out</strong>
            </span>
          </button>
        </form>
      </Group>
    </main>
  );
}

type Row = { href: string; label: string; icon: IconName; note?: string; locked?: string };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mo-group">
      <h2 className="mo-label">{title}</h2>
      <div className="mo-list">{children}</div>
    </section>
  );
}

function MoreRow({ href, label, icon, note, locked }: Row) {
  return (
    <Link href={href} className="mo-row" {...lock(locked)}>
      <span className="mo-tile">
        <Icon name={icon} />
      </span>
      <span className="mo-text">
        <strong>{label}</strong>
        {note && <span>{note}</span>}
      </span>
      <LinkPending>
        <Icon name="chevron" className="mo-chev" />
      </LinkPending>
    </Link>
  );
}
