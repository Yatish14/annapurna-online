import Link from "next/link";
import Icon, { type IconName } from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import {
  buildReports,
  cellText,
  cellTone,
  isReportView,
  monthLabel,
  pdfName,
  REPORT_VIEWS,
  viewTitle,
  type Report,
  type ReportView,
  type Section,
} from "@/lib/expenses/reports";
import { parseMonth, readParams, type SearchParams } from "../../filters";

export const metadata = { title: "Reports · Expense Tracker" };

const shiftMonth = (m: string, by: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + by, 1)).toISOString().slice(0, 7);

const TABS: Record<ReportView, { label: string; icon: IconName }> = {
  all: { label: "All", icon: "overview" },
  bookings: { label: "Bookings", icon: "bookings" },
  customers: { label: "Customers", icon: "users" },
  drivers: { label: "Drivers", icon: "steering" },
  vehicles: { label: "Vehicles", icon: "car" },
};

const reportHref = (tab: ReportView, month: string) => `/admin/expenses/reports?tab=${tab}&month=${month}`;

/** One table of the report; on phones each row becomes a card */
function ReportTable({ section }: { section: Section }) {
  const [first, ...rest] = section.columns;
  const cellClass = (i: number, value: Parameters<typeof cellTone>[0]) => {
    const column = section.columns[i];
    const tone = cellTone(value, column);
    return [column.kind === "text" ? "is-text" : "", tone === "neg" ? "is-neg" : tone === "pos" ? "is-pos" : ""].filter(Boolean).join(" ") || undefined;
  };
  return (
    <section className="xp-rsection">
      <h3>{section.title}</h3>
      {section.rows.length === 0 ? (
        <p className="ap-empty-sm">{section.empty}</p>
      ) : (
        <div className="xp-tablewrap">
          <table className="xp-table xp-rtable">
            <thead>
              <tr>
                {section.columns.map((c) => (
                  <th key={c.label} className={c.kind === "text" ? "is-text" : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, r) => (
                <tr key={r}>
                  <th scope="row">{row.href ? <Link href={row.href}>{cellText(row.cells[0], first)}</Link> : cellText(row.cells[0], first)}</th>
                  {rest.map((c, i) => (
                    <td key={c.label} data-label={c.label} className={cellClass(i + 1, row.cells[i + 1])}>
                      <span className="xp-nowrap">{cellText(row.cells[i + 1], c)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {section.total && (
              <tfoot>
                <tr>
                  <th scope="row">{cellText(section.total[0], first)}</th>
                  {rest.map((c, i) => {
                    const value = section.total![i + 1];
                    return value === "" ? (
                      <td key={c.label} className="is-blank" />
                    ) : (
                      <td key={c.label} data-label={c.label} className={cellClass(i + 1, value)}>
                        <span className="xp-nowrap">{cellText(value, c)}</span>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

/** One report: its title, summary boxes, tables and notes */
function ReportBody({ report, month }: { report: Report; month: string }) {
  return (
    <div className="xp-reportbody" id={`report-${report.tab}`}>
      <h2 className="xp-reporttitle">
        {report.title} <span>· {monthLabel(month)}</span>
      </h2>

      <div className="xp-sumtiles">
        {report.tiles.map((t) => (
          <div key={t.label} className={`xp-sumtile is-${t.tone}`}>
            <span>{t.label}</span>
            <strong>{t.money ? formatRupees(t.value) : formatNumber(t.value)}</strong>
            {t.sub && <small>{t.sub}</small>}
          </div>
        ))}
      </div>

      {report.sections.map((s) => (
        <ReportTable key={s.title} section={s} />
      ))}

      <div className="ap-hint xp-reportnotes">
        {report.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const params = await readParams(searchParams);
  const month = parseMonth(params);
  const tabParam = params.get("tab");
  const tab: ReportView = isReportView(tabParam) ? tabParam : "all";
  const reports = await buildReports(tab, month);

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Expense Tracker"
        title="Reports"
        subtitle="The month's bookings, customers, drivers and vehicles. Download any of them as a PDF."
      >
        <nav className="ap-cal-nav" aria-label="Month">
          <Link href={reportHref(tab, shiftMonth(month, -1))} aria-label="Previous month" scroll={false}>
            ‹<LinkPending />
          </Link>
          <strong>{monthLabel(month)}</strong>
          <Link href={reportHref(tab, shiftMonth(month, 1))} aria-label="Next month" scroll={false}>
            ›<LinkPending />
          </Link>
        </nav>
        {/* Keyed so the box shows the month again after the arrows change it */}
        <form key={month} className="xp-monthpick" action="/admin/expenses/reports">
          <input type="hidden" name="tab" value={tab} />
          <label className="sr-only" htmlFor="report-month">
            Month
          </label>
          <input id="report-month" type="month" name="month" defaultValue={month} min="2020-01" max="2099-12" required />
          <button type="submit" className="ap-btn ap-btn-ghost ap-btn-sm">
            Show
          </button>
        </form>
      </PageHeader>

      <section className="ap-panel xp-reportview" aria-label={viewTitle(tab)}>
        <div className="ap-toolbar">
          <nav className="ap-tabs" aria-label="Report">
            {REPORT_VIEWS.map((t) => (
              <Link key={t} href={reportHref(t, month)} scroll={false} className={t === tab ? "is-active" : ""} aria-current={t === tab ? "page" : undefined}>
                <Icon name={TABS[t].icon} size={15} /> {TABS[t].label}
                <LinkPending />
              </Link>
            ))}
          </nav>
          <a
            className="ap-btn ap-btn-gold xp-report-pdf"
            href={`/admin/expenses/reports/pdf?month=${month}&tab=${tab}`}
            download={pdfName(tab, month)}
          >
            <Icon name="download" size={16} /> {tab === "all" ? "Download all as PDF" : "Download PDF"}
          </a>
        </div>

        {reports.map((r) => (
          <ReportBody key={r.tab} report={r} month={month} />
        ))}
      </section>
    </main>
  );
}
