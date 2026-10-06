import Link from "next/link";
import { listActivity, type ActivityAction, type ActivityFilter, type ActivityRow } from "@/lib/activity";
import { formatPhone } from "@/lib/format";
import Icon, { type IconName } from "./Icon";
import LinkPending from "./LinkPending";

const ACTIONS: Record<ActivityAction, { icon: IconName; tone: string; text: (target: string) => React.ReactNode }> = {
  "enquiry.created": { icon: "whatsapp", tone: "green", text: (t) => <>sent a new enquiry <b>{t}</b> on WhatsApp</> },
  "booking.confirmed": { icon: "check", tone: "green", text: (t) => <>marked <b>{t}</b> as booked</> },
  "booking.rejected": { icon: "xcircle", tone: "red", text: (t) => <>rejected enquiry <b>{t}</b></> },
  "booking.cancelled": { icon: "trash", tone: "red", text: (t) => <>cancelled booking <b>{t}</b></> },
  "booking.message_resent": { icon: "send", tone: "navy", text: (t) => <>resent the WhatsApp message for <b>{t}</b></> },
  "order.created": { icon: "file", tone: "gold", text: (t) => <>sent print order <b>{t}</b></> },
  "order.file_printed": { icon: "printer", tone: "navy", text: (t) => <>printed a file from <b>{t}</b></> },
  "order.collected": { icon: "bag", tone: "green", text: (t) => <>marked <b>{t}</b> as collected</> },
  "order.reopened": { icon: "undo", tone: "gold", text: (t) => <>moved <b>{t}</b> back from collected</> },
  "order.files_deleted": { icon: "trash", tone: "red", text: (t) => <>deleted the files of <b>{t}</b> early</> },
  "print.uploads_paused": { icon: "pause", tone: "red", text: () => <>paused customer uploads</> },
  "print.uploads_resumed": { icon: "play", tone: "green", text: () => <>resumed customer uploads</> },
  "print.files_deleted": { icon: "trash", tone: "navy", text: () => <>deleted old customer files</> },
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

type Props = {
  module: "cars" | "print";
  /** This page's URL, for the filter tabs */
  path: string;
  /** Label of the module's own entries, e.g. "Bookings" */
  moduleLabel: string;
  filter: string | null;
  emptyText: string;
};

/** One module's activity log (plus team changes), grouped by day */
export default async function ActivityFeed({ module, path, moduleLabel, filter: requested, emptyText }: Props) {
  const filters: { id: ActivityFilter; label: string }[] = [
    { id: "all", label: "Everything" },
    { id: "module", label: moduleLabel },
    { id: "users", label: "Team" },
  ];
  const filter = filters.find((f) => f.id === requested)?.id ?? "all";
  const rows = await listActivity(module, filter);

  const days: { day: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last?.day === row.day) last.rows.push(row);
    else days.push({ day: row.day, rows: [row] });
  }

  return (
    <section className="ap-panel">
      <div className="ap-toolbar">
        <nav className="ap-tabs" aria-label="Show">
          {filters.map((f) => (
            <Link key={f.id} href={`${path}?type=${f.id}`} scroll={false} className={filter === f.id ? "is-active" : ""}>
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
          <p>{emptyText}</p>
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
  );
}
