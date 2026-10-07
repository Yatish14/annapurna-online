import Link from "next/link";
import Icon, { type IconName } from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { formatRupees } from "@/lib/expenses/money";
import { buildMonthlyReport, monthLabel } from "@/lib/expenses/reports";
import { parseMonth, readParams, type SearchParams } from "../../filters";

export const metadata = { title: "Reports · Expense Tracker" };

const shiftMonth = (m: string, by: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + by, 1)).toISOString().slice(0, 7);

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const month = parseMonth(await readParams(searchParams));
  const report = await buildMonthlyReport(month);
  const { counts } = report;

  const sections: { icon: IconName; title: string; text: string }[] = [
    { icon: "chart", title: "Summary", text: "Money in, money out and net; bookings, km, billed, balance due and profit." },
    { icon: "car", title: `Vehicles · ${counts.vehicles}`, text: "Each vehicle's bookings, km, billed, received, driver amount, fuel, repairs, EMI, insurance and profit." },
    { icon: "bookings", title: `Bookings · ${counts.bookings}`, text: "Every booking starting in the month: customer, vehicle, driver, route, referrer, km, amounts and profit." },
    { icon: "rupee", title: `Payments · ${counts.payments}`, text: "Every payment from customers and to drivers, with date, time, method and who recorded it." },
    { icon: "wallet", title: `Vehicle costs · ${counts.costs}`, text: "Every fuel fill-up, repair, EMI and insurance premium, with the vehicle, booking, shop and place." },
  ];

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Expense Tracker"
        title="Reports"
        subtitle="One file with everything for the month, ready to open in Excel or Google Sheets."
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

      <article className="ap-panel xp-report">
        <div className="xp-report-head">
          <span className="ap-tile-icon is-gold">
            <Icon name="download" size={20} />
          </span>
          <div>
            <h2>Monthly report · {monthLabel(month)}</h2>
            <span className="ap-muted">CSV file · {report.filename}</span>
          </div>
        </div>
        <dl className="xp-report-figures">
          {report.highlights.map((h) => (
            <div key={h.label}>
              <dt>{h.label}</dt>
              <dd className={h.amount < 0 ? "is-neg" : ""}>{formatRupees(h.amount)}</dd>
            </div>
          ))}
        </dl>
        <h3 className="xp-report-sub">What&apos;s inside</h3>
        <ul className="xp-report-sections">
          {sections.map((s) => (
            <li key={s.title}>
              <Icon name={s.icon} size={16} />
              <div>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </div>
            </li>
          ))}
        </ul>
        <a className="ap-btn ap-btn-gold xp-report-btn" href={`/admin/expenses/reports/download?month=${month}`} download={report.filename}>
          <Icon name="download" size={16} /> Download {monthLabel(month)} report
        </a>
      </article>
      <p className="ap-hint">
        Amounts are plain numbers in rupees, so the spreadsheet can add them up. Removed payments and costs are listed (with who
        removed them) but not counted in the totals. Every download is recorded in Activity.
      </p>
    </main>
  );
}
