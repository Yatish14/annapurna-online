import Link from "next/link";
import { listActivity, type ActivityAction, type ActivityFilter, type ActivityRow } from "@/lib/activity";
import { formatPhone } from "@/lib/format";
import Icon, { type IconName } from "./Icon";
import { pageCount, PAGE_SIZE } from "@/lib/pagination";
import LinkPending from "./LinkPending";
import Pagination from "./Pagination";

const ACTIONS: Record<ActivityAction, { icon: IconName; tone: string; text: (target: React.ReactNode) => React.ReactNode }> = {
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
  "vehicle.created": { icon: "car", tone: "gold", text: (t) => <>added vehicle <b>{t}</b></> },
  "vehicle.renamed": { icon: "edit", tone: "navy", text: (t) => <>renamed a vehicle to <b>{t}</b></> },
  "vehicle.deactivated": { icon: "pause", tone: "red", text: (t) => <>switched off vehicle <b>{t}</b></> },
  "vehicle.reactivated": { icon: "play", tone: "green", text: (t) => <>switched vehicle <b>{t}</b> back on</> },
  "vehicle.deleted": { icon: "trash", tone: "red", text: (t) => <>deleted vehicle <b>{t}</b></> },
  "vehicle.emi_updated": { icon: "edit", tone: "navy", text: (t) => <>updated the loan (EMI) details of <b>{t}</b></> },
  "vehicle.insurance_updated": { icon: "shield", tone: "navy", text: (t) => <>updated the insurance of <b>{t}</b></> },
  "expense.emi_paid": { icon: "rupee", tone: "plum", text: (t) => <>recorded an EMI payment for <b>{t}</b></> },
  "expense.insurance_paid": { icon: "shield", tone: "plum", text: (t) => <>recorded an insurance premium for <b>{t}</b></> },
  "driver.created": { icon: "steering", tone: "gold", text: (t) => <>added driver <b>{t}</b></> },
  "driver.updated": { icon: "edit", tone: "navy", text: (t) => <>updated driver <b>{t}</b></> },
  "driver.deactivated": { icon: "pause", tone: "red", text: (t) => <>switched off driver <b>{t}</b></> },
  "driver.reactivated": { icon: "play", tone: "green", text: (t) => <>switched driver <b>{t}</b> back on</> },
  "driver.deleted": { icon: "trash", tone: "red", text: (t) => <>deleted driver <b>{t}</b></> },
  "trip.created": { icon: "bookings", tone: "gold", text: (t) => <>created booking <b>{t}</b></> },
  "trip.updated": { icon: "edit", tone: "navy", text: (t) => <>edited booking <b>{t}</b></> },
  "trip.readings_updated": { icon: "edit", tone: "navy", text: (t) => <>updated the readings and amounts of <b>{t}</b></> },
  "trip.cancelled": { icon: "xcircle", tone: "red", text: (t) => <>cancelled booking <b>{t}</b></> },
  "trip.restored": { icon: "undo", tone: "green", text: (t) => <>restored booking <b>{t}</b></> },
  "payment.received": { icon: "rupee", tone: "green", text: (t) => <>recorded a customer payment for <b>{t}</b></> },
  "payment.driver_paid": { icon: "wallet", tone: "navy", text: (t) => <>recorded a driver payment for <b>{t}</b></> },
  "payment.removed": { icon: "trash", tone: "red", text: (t) => <>removed a payment from <b>{t}</b></> },
  "expense.fuel_added": { icon: "fuel", tone: "gold", text: (t) => <>added fuel for <b>{t}</b></> },
  "expense.repair_added": { icon: "wrench", tone: "gold", text: (t) => <>added a repair for <b>{t}</b></> },
  "expense.fastag_added": { icon: "tag", tone: "gold", text: (t) => <>added a FASTag recharge for <b>{t}</b></> },
  "expense.other_added": { icon: "receipt", tone: "gold", text: (t) => <>added an expense to <b>{t}</b></> },
  "expense.removed": { icon: "trash", tone: "red", text: (t) => <>removed a cost entry from <b>{t}</b></> },
  "report.downloaded": { icon: "download", tone: "navy", text: (t) => <>downloaded a report for <b>{t}</b></> },
  "trip.statement_downloaded": { icon: "download", tone: "navy", text: (t) => <>downloaded the expense statement for <b>{t}</b></> },
  "user.created": { icon: "userplus", tone: "gold", text: (t) => <>added <b>{t}</b></> },
  "user.deleted": { icon: "trash", tone: "red", text: (t) => <>removed <b>{t}</b></> },
  "user.password_reset": { icon: "key", tone: "gold", text: (t) => <>reset the password of <b>{t}</b></> },
  "user.password_changed": { icon: "key", tone: "navy", text: () => <>changed their own password</> },
};

/** One activity line. Booking numbers link to the booking (unless `linkTargets` is off, e.g. on that booking's own page). */
export function ActivityEntry({ row, linkTargets = true }: { row: ActivityRow; linkTargets?: boolean }) {
  const a = ACTIONS[row.action];
  const target =
    linkTargets && row.target && /^VB-\d+$/.test(row.target) ? (
      <Link href={`/admin/expenses/bookings/${row.target}`} className="ap-act-link">
        {row.target}
      </Link>
    ) : (
      row.target ?? ""
    );
  return (
    <li className="ap-act">
      <span className={`ap-act-icon is-${a?.tone ?? "navy"}`}>
        <Icon name={a?.icon ?? "activity"} size={16} />
      </span>
      <div className="ap-act-main">
        <p>
          <strong>{row.actor_name}</strong> {a ? a.text(target) : `${row.action} ${row.target ?? ""}`}
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
  module: "cars" | "print" | "expenses";
  /** This page's URL, for the filter tabs */
  path: string;
  /** Label of the module's own entries, e.g. "Bookings" */
  moduleLabel: string;
  filter: string | null;
  /** Page number from the URL */
  page: number;
  emptyText: string;
};

/** One module's activity log (plus team changes), grouped by day */
export default async function ActivityFeed({ module, path, moduleLabel, filter: requested, page: requestedPage, emptyText }: Props) {
  const filters: { id: ActivityFilter; label: string }[] = [
    { id: "all", label: "Everything" },
    { id: "module", label: moduleLabel },
    { id: "users", label: "Team" },
  ];
  const filter = filters.find((f) => f.id === requested)?.id ?? "all";
  let page = requestedPage;
  let { rows, total } = await listActivity(module, filter, { page, pageSize: PAGE_SIZE });
  const totalPages = pageCount(total);
  if (rows.length === 0 && total > 0 && page > totalPages) {
    page = totalPages;
    ({ rows, total } = await listActivity(module, filter, { page, pageSize: PAGE_SIZE }));
  }
  const first = (page - 1) * PAGE_SIZE + 1;
  const href = (n: number) => `${path}?type=${filter}${n > 1 ? `&page=${n}` : ""}`;

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
        <span className="ap-muted">{total} {total === 1 ? "entry" : "entries"}</span>
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
                <ActivityEntry key={row.id} row={row} />
              ))}
            </ul>
          </div>
        ))
      )}

      <Pagination page={page} totalPages={totalPages} href={href} summary={`Showing ${first}–${first + rows.length - 1} of ${total} entries`} />
    </section>
  );
}
