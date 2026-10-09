import Link from "next/link";
import Icon, { type IconName } from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { formatRupees } from "@/lib/expenses/money";
import { loadMonth, makeReport, monthLabel, type ReportType } from "@/lib/expenses/reports";
import { parseMonth, readParams, type SearchParams } from "../../filters";

export const metadata = { title: "Reports · Expense Tracker" };

const shiftMonth = (m: string, by: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + by, 1)).toISOString().slice(0, 7);

const REPORTS: { type: ReportType; icon: IconName; text: string }[] = [
  {
    type: "bookings",
    icon: "bookings",
    text: "Every booking starting in the month: customer, vehicle, driver, route, referrer, km, amounts, fuel, tolls and other expenses, and profit.",
  },
  {
    type: "drivers",
    icon: "steering",
    text: "Each driver's bookings, days, km, agreed amount, paid and still to pay; their bookings one by one; and payments made to them.",
  },
  {
    type: "repairs",
    icon: "wrench",
    text: "Every repair in the month with the vehicle, what was done, shop and place, plus each vehicle's total.",
  },
];

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const month = parseMonth(await readParams(searchParams));
  const data = await loadMonth(month);

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Expense Tracker"
        title="Reports"
        subtitle="The month's bookings, drivers and repairs as CSV files, ready to open in Excel or Google Sheets."
      >
        <nav className="ap-cal-nav" aria-label="Month">
          <Link href={`/admin/expenses/reports?month=${shiftMonth(month, -1)}`} aria-label="Previous month" scroll={false}>
            ‹<LinkPending />
          </Link>
          <strong>{monthLabel(month)}</strong>
          <Link href={`/admin/expenses/reports?month=${shiftMonth(month, 1)}`} aria-label="Next month" scroll={false}>
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

      <section className="xp-reportgrid" aria-label="Reports">
        {REPORTS.map((r) => {
          const report = makeReport(r.type, data);
          return (
            <article key={r.type} className="ap-panel xp-report" id={`report-${r.type}`}>
              <div className="xp-report-head">
                <span className="ap-tile-icon is-gold">
                  <Icon name={r.icon} size={20} />
                </span>
                <div>
                  <h2>{report.title}</h2>
                  <span className="ap-muted">{report.filename}</span>
                </div>
              </div>
              <p>{r.text}</p>
              <dl className="xp-report-figures">
                {report.highlights.map((h) => (
                  <div key={h.label}>
                    <dt>{h.label}</dt>
                    <dd className={h.value < 0 ? "is-neg" : ""}>{h.money ? formatRupees(h.value) : h.value}</dd>
                  </div>
                ))}
              </dl>
              <a
                className="ap-btn ap-btn-gold xp-report-btn"
                href={`/admin/expenses/reports/download?month=${month}&type=${report.type}`}
                download={report.filename}
              >
                <Icon name="download" size={16} /> Download {report.title.toLowerCase()}
              </a>
            </article>
          );
        })}
      </section>

      <p className="ap-hint">
        Amounts are plain numbers in rupees, so the spreadsheet can add them up. Removed payments and repairs are listed (with who
        removed them) but not counted in the totals. Every download is recorded in Activity.
      </p>
    </main>
  );
}
