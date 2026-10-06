import Link from "next/link";
import Icon, { type IconName } from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { formatRupees } from "@/lib/expenses/money";
import { buildReport, monthLabel, REPORT_TYPES, REPORTS, type ReportType } from "@/lib/expenses/reports";
import { parseMonth, readParams, type SearchParams } from "../../filters";

export const metadata = { title: "Reports · Expense Tracker" };

const ICONS: Record<ReportType, IconName> = { bookings: "bookings", payments: "rupee", costs: "fuel", vehicles: "car" };

const shiftMonth = (m: string, by: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + by, 1)).toISOString().slice(0, 7);

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const month = parseMonth(await readParams(searchParams));
  const reports = await Promise.all(REPORT_TYPES.map(async (type) => ({ type, ...(await buildReport(type, month)) })));

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Expense Tracker"
        title="Reports"
        subtitle="Download a month's figures as CSV files, ready to open in Excel or Google Sheets."
      >
        <nav className="ap-cal-nav" aria-label="Month">
          <Link href={`/admin/expenses/reports?month=${shiftMonth(month, -1)}`} aria-label="Previous month" scroll={false}>
            ‹<LinkPending />
          </Link>
          <strong>{monthLabel(month)}</strong>
          <Link
            href={`/admin/expenses/reports?month=${shiftMonth(month, 1)}`}
            aria-label="Next month"
            scroll={false}
          >
            ›<LinkPending />
          </Link>
        </nav>
        <form className="xp-monthpick" action="/admin/expenses/reports">
          <label className="sr-only" htmlFor="report-month">
            Month
          </label>
          <input id="report-month" type="month" name="month" defaultValue={month} min="2020-01" max="2099-12" required />
          <button type="submit" className="ap-btn ap-btn-ghost ap-btn-sm">
            Show
          </button>
        </form>
      </PageHeader>

      <section className="xp-reports">
        {reports.map((r) => (
          <article key={r.type} className="ap-panel xp-report">
            <div className="xp-report-head">
              <span className="ap-tile-icon is-gold">
                <Icon name={ICONS[r.type]} size={20} />
              </span>
              <div>
                <h2>{REPORTS[r.type].title}</h2>
                <span className="ap-muted">
                  {monthLabel(month)} · {r.count} {r.count === 1 ? "row" : "rows"}
                </span>
              </div>
            </div>
            <p>{REPORTS[r.type].description}</p>
            <dl className="xp-report-figures">
              {r.highlights.map((h) => (
                <div key={h.label}>
                  <dt>{h.label}</dt>
                  <dd className={h.amount < 0 ? "is-neg" : ""}>{formatRupees(h.amount)}</dd>
                </div>
              ))}
            </dl>
            <a
              className="ap-btn ap-btn-gold xp-report-btn"
              href={`/admin/expenses/reports/download?type=${r.type}&month=${month}`}
              download={r.filename}
            >
              <Icon name="download" size={16} /> Download CSV
            </a>
            <span className="xp-report-file">{r.filename}</span>
          </article>
        ))}
      </section>
      <p className="ap-hint">
        Amounts are plain numbers in rupees, so the spreadsheet can add them up. Removed payments and costs are listed (with who
        removed them) but not counted in the totals. Every download is recorded in Activity.
      </p>
    </main>
  );
}
