import Link from "next/link";
import Icon, { type IconName } from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { listActivity, type ActivityAction, type ActivityFilter, type ActivityRow } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { readParams, type SearchParams } from "../filters";

export const metadata = { title: "Activity" };

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "bookings", label: "Bookings" },
  { id: "users", label: "Users" },
];

const ACTIONS: Record<ActivityAction, { icon: IconName; tone: string; text: (target: string) => React.ReactNode }> = {
  "enquiry.created": { icon: "whatsapp", tone: "green", text: (t) => <>sent a new enquiry <b>{t}</b> on WhatsApp</> },
  "booking.confirmed": { icon: "check", tone: "green", text: (t) => <>marked <b>{t}</b> as booked</> },
  "booking.rejected": { icon: "xcircle", tone: "red", text: (t) => <>rejected enquiry <b>{t}</b></> },
  "booking.cancelled": { icon: "trash", tone: "red", text: (t) => <>cancelled booking <b>{t}</b></> },
  "booking.message_resent": { icon: "send", tone: "navy", text: (t) => <>resent the WhatsApp message for <b>{t}</b></> },
  "user.created": { icon: "userplus", tone: "gold", text: (t) => <>added <b>{t}</b></> },
  "user.deleted": { icon: "trash", tone: "red", text: (t) => <>removed <b>{t}</b></> },
  "user.password_reset": { icon: "key", tone: "gold", text: (t) => <>reset the password of <b>{t}</b></> },
  "user.password_changed": { icon: "key", tone: "navy", text: () => <>changed their own password</> },
};

function Entry({ row }: { row: ActivityRow }) {
  const a = ACTIONS[row.action];
  return (
    <li className="ap-act">
      <span className={`ap-act-icon is-${a?.tone ?? "navy"}`}>
        <Icon name={a?.icon ?? "activity"} size={16} />
      </span>
      <div className="ap-act-main">
        <p>
          <strong>{row.actor_name}</strong> {a ? a.text(row.target ?? "") : `${row.action} ${row.target ?? ""}`}
        </p>
        {row.details && <span className="ap-act-details">{row.details}</span>}
      </div>
      <div className="ap-act-side">
        <time>{row.time}</time>
        {row.actor_mobile && <span>{formatPhone(row.actor_mobile)}</span>}
      </div>
    </li>
  );
}

export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("viewActivity");
  const params = await readParams(searchParams);
  const filter = (FILTERS.find((f) => f.id === params.get("type"))?.id ?? "all") as ActivityFilter;
  const rows = await listActivity(filter);

  // Group by day, newest first
  const days: { day: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last?.day === row.day) last.rows.push(row);
    else days.push({ day: row.day, rows: [row] });
  }

  return (
    <main className="ap-page">
      <PageHeader title="Activity" subtitle="Every change made in the dashboard, and every new WhatsApp enquiry: who, what and when." />

      <section className="ap-panel">
        <div className="ap-toolbar">
          <nav className="ap-tabs" aria-label="Show">
            {FILTERS.map((f) => (
              <Link key={f.id} href={`/admin/activity?type=${f.id}`} scroll={false} className={filter === f.id ? "is-active" : ""}>
                {f.label}
                <LinkPending />
              </Link>
            ))}
          </nav>
          <span className="ap-muted">Latest {rows.length} entries</span>
        </div>

        {days.length === 0 ? (
          <div className="ap-empty">
            <Icon name="activity" size={32} />
            <p>Nothing has happened yet. Changes will appear here as people use the dashboard.</p>
          </div>
        ) : (
          days.map((d) => (
            <div key={d.day} className="ap-act-day">
              <h3>{d.day.replace(/\s+,/, ",")}</h3>
              <ul className="ap-acts">
                {d.rows.map((row) => (
                  <Entry key={row.id} row={row} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
