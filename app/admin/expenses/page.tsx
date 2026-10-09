import Link from "next/link";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import { can, requireUser } from "@/lib/auth";
import { addDays, fmtRange, MONTHS_LONG, todayIST } from "@/lib/dates";
import { listDrivers } from "@/lib/expenses/fleet";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import { monthSummary, outstanding, vehicleProfit, vehiclesMonth } from "@/lib/expenses/overview";
import { balanceOf, listTrips, routeText, type Trip } from "@/lib/expenses/trips";
import { reminders } from "@/lib/expenses/finance";
import { formatPhone } from "@/lib/format";
import { parseMonth, readParams, type SearchParams } from "../filters";

export const metadata = { title: "Expense Tracker" };

const monthName = (m: string) => `${MONTHS_LONG[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const shiftMonth = (m: string, by: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

function TripLine({ t, extra }: { t: Trip; extra?: React.ReactNode }) {
  return (
    <li className="ap-row xp-rowlink">
      <div className="ap-row-main">
        <Link href={`/admin/expenses/bookings/${t.trip_no}`} className="xp-cardlink">
          <strong>{t.customer_name}</strong>
        </Link>
        <span>
          {t.vehicle_name} · {t.driver_name} · {routeText(t)} · {fmtRange(t.start_date, t.end_date)}
        </span>
      </div>
      {extra}
      <span className="ap-row-ref">{t.trip_no}</span>
    </li>
  );
}

export default async function ExpensesOverview({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await readParams(searchParams);
  const month = parseMonth(params);
  const thisMonth = todayIST().slice(0, 7);

  const [summary, vehicles, owed, ongoing, upcoming, dues, drivers, alerts] = await Promise.all([
    monthSummary(month),
    vehiclesMonth(month),
    outstanding(),
    listTrips("ongoing", { pageSize: 10 }),
    listTrips("upcoming", { pageSize: 5 }),
    listTrips("due", { pageSize: 6 }),
    listDrivers(),
    reminders(),
  ]);
  const moneyOut = summary.driverPaid + summary.fuel + summary.other + summary.repairs + summary.fastag + summary.emi + summary.insurance;
  const driversToPay = drivers.filter((d) => d.owed > 0);
  // Upcoming bookings in the next two weeks only
  const soon = addDays(todayIST(), 14);
  const nextTrips = upcoming.trips.filter((t) => t.start_date <= soon);

  const tiles = [
    { label: "Money in", value: formatRupees(summary.received), sub: "Received from customers", icon: "rupee" as const, tone: "green" },
    { label: "Money out", value: formatRupees(moneyOut), sub: "Drivers, fuel, tolls & other, repairs, FASTag, EMI, insurance", icon: "wallet" as const, tone: "plum" },
    {
      label: "Net",
      value: formatRupees(summary.received - moneyOut),
      sub: "Money in − money out",
      icon: "chart" as const,
      tone: summary.received - moneyOut < 0 ? "red" : "navy",
    },
    {
      label: "Bookings",
      value: String(summary.bookings),
      sub: `${formatNumber(summary.km)} km · billed ${formatRupees(summary.billed)}`,
      icon: "bookings" as const,
      tone: "gold",
    },
  ];

  return (
    <main className="ap-page">
      <PageHeader eyebrow="Expense Tracker" title="Overview" subtitle="Money in and out for the month, and what is still owed.">
        <nav className="ap-cal-nav" aria-label="Month">
          <Link href={`/admin/expenses?month=${shiftMonth(month, -1)}`} aria-label="Previous month" scroll={false}>
            ‹<LinkPending />
          </Link>
          <strong>{monthName(month)}</strong>
          <Link href={`/admin/expenses?month=${shiftMonth(month, 1)}`} aria-label="Next month" scroll={false}>
            ›<LinkPending />
          </Link>
        </nav>
        {can(user, "manageExpenses") && (
          <Link href="/admin/expenses/bookings/new" className="ap-btn ap-btn-gold">
            <Icon name="plus" size={16} /> New booking
          </Link>
        )}
      </PageHeader>
      <Flash params={params} />
      {month !== thisMonth && (
        <p className="ap-note ap-note-warn xp-monthnote">
          Showing {monthName(month)}.{" "}
          <Link href="/admin/expenses" className="ap-link">
            Back to this month
          </Link>
        </p>
      )}

      <section className="ap-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="ap-tile">
            <span className={`ap-tile-icon is-${t.tone === "red" ? "plum" : t.tone}`}>
              <Icon name={t.icon} size={20} />
            </span>
            <span className="ap-tile-label">{t.label}</span>
            <strong className={`ap-tile-value xp-tilemoney ${t.tone === "red" ? "is-neg" : ""}`}>{t.value}</strong>
            <span className="xp-tilesub">{t.sub}</span>
          </div>
        ))}
      </section>

      {alerts.length > 0 && (
        <section className="ap-panel xp-reminders">
          <div className="ap-panel-head">
            <h2>Reminders</h2>
            <span className="ap-muted">EMIs and insurance</span>
          </div>
          <ul className="ap-rows">
            {alerts.map((a) => (
              <li key={`${a.vehicleId}-${a.kind}`} className={`ap-row xp-rowlink xp-reminder is-${a.tone}`}>
                <span className="xp-reminder-icon">
                  <Icon name={a.kind === "emi" ? "wallet" : "shield"} size={18} />
                </span>
                <div className="ap-row-main">
                  <Link href={`/admin/expenses/fleet/${a.vehicleId}#${a.kind}`} className="xp-cardlink">
                    <strong>{a.vehicle}</strong>
                  </Link>
                  <span>{a.text}</span>
                </div>
                <span className={`xp-state ${a.tone === "overdue" ? "is-late" : "is-out"}`}>{a.tone === "overdue" ? (a.kind === "emi" ? "Overdue" : "Expired") : "Due soon"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="xp-owedrow">
        <Link href="/admin/expenses/bookings?view=due" className="xp-owedcard is-customer">
          <Icon name="rupee" size={20} />
          <div>
            <span>To collect from customers</span>
            <strong>{formatRupees(owed.customerDue)}</strong>
            <small>
              {owed.customerTrips} booking{owed.customerTrips === 1 ? "" : "s"} with a balance · all months
            </small>
          </div>
          <Icon name="arrow" size={16} />
        </Link>
        <a href="#drivers-to-pay" className="xp-owedcard is-driver">
          <Icon name="steering" size={20} />
          <div>
            <span>To pay drivers</span>
            <strong>{formatRupees(owed.driverDue)}</strong>
            <small>
              {owed.driverTrips} booking{owed.driverTrips === 1 ? "" : "s"} not settled · all months
            </small>
          </div>
          <Icon name="arrow" size={16} />
        </a>
      </section>

      <section className="ap-panel">
        <div className="ap-panel-head">
          <h2>Vehicles in {monthName(month)}</h2>
          <Link href="/admin/expenses/fleet" className="ap-link">
            Vehicles & drivers <Icon name="arrow" size={15} />
          </Link>
        </div>
        {vehicles.length === 0 ? (
          <p className="ap-empty-sm">
            No vehicles yet. <Link href="/admin/expenses/fleet" className="ap-link">Add your cars and drivers</Link> to start.
          </p>
        ) : (
          <div className="xp-tablewrap">
            <table className="xp-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Bookings</th>
                  <th>Km</th>
                  <th>Billed</th>
                  <th>Received</th>
                  <th>Driver</th>
                  <th>Fuel</th>
                  <th>Other</th>
                  <th>Repairs</th>
                  <th>FASTag</th>
                  <th>EMI</th>
                  <th>Insurance</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const profit = vehicleProfit(v);
                  return (
                    <tr key={v.id}>
                      <th scope="row">
                        <Link href={`/admin/expenses/fleet/${v.id}`}>{v.name}</Link>
                        {!v.active && <small> (switched off)</small>}
                      </th>
                      <td data-label="Bookings">{v.bookings}</td>
                      <td data-label="Km">{formatNumber(v.km)}</td>
                      <td data-label="Billed">{formatRupees(v.billed)}</td>
                      <td data-label="Received">{formatRupees(v.received)}</td>
                      <td data-label="Driver">{formatRupees(v.driverAmount)}</td>
                      <td data-label="Fuel">{formatRupees(v.fuel)}</td>
                      <td data-label="Other">{formatRupees(v.other)}</td>
                      <td data-label="Repairs">{formatRupees(v.repairs)}</td>
                      <td data-label="FASTag">{formatRupees(v.fastag)}</td>
                      <td data-label="EMI">{formatRupees(v.emi)}</td>
                      <td data-label="Insurance">{formatRupees(v.insurance)}</td>
                      <td data-label="Profit" className={profit < 0 ? "is-neg" : "is-pos"}>
                        {formatRupees(profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ap-hint">
          Profit is on money actually received: received − driver amount − fuel − other booking expenses (tolls, parking…) −
          repairs − FASTag − EMI − insurance. Billed, received and driver amounts count bookings that start in the month (received
          = paid so far); the costs count the date they were paid.
        </p>
      </section>

      <div className="ap-grid-2">
        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Customers who still owe</h2>
            <Link href="/admin/expenses/bookings?view=due" className="ap-link">
              View all <Icon name="arrow" size={15} />
            </Link>
          </div>
          {dues.trips.length === 0 ? (
            <p className="ap-empty-sm">Nothing to collect. ✨</p>
          ) : (
            <ul className="ap-rows">
              {dues.trips.map((t) => (
                <TripLine key={t.id} t={t} extra={<b className="xp-owed xp-nowrap">{formatRupees(balanceOf(t))}</b>} />
              ))}
            </ul>
          )}
        </section>

        <section className="ap-panel" id="drivers-to-pay">
          <div className="ap-panel-head">
            <h2>Drivers to pay</h2>
          </div>
          {driversToPay.length === 0 ? (
            <p className="ap-empty-sm">Every driver is settled.</p>
          ) : (
            <ul className="ap-rows">
              {driversToPay.map((d) => (
                <li key={d.id} className="ap-row xp-rowlink">
                  <div className="ap-row-main">
                    <Link href={`/admin/expenses/fleet/drivers/${d.id}#unpaid`} className="xp-cardlink">
                      <strong>{d.name}</strong>
                    </Link>
                    <span>
                      <a href={`tel:+91${d.phone}`}>{formatPhone(d.phone)}</a>
                    </span>
                  </div>
                  <b className="xp-owed xp-nowrap">{formatRupees(d.owed)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="ap-grid-2">
        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Out on a trip today</h2>
            <Link href="/admin/expenses/bookings?view=ongoing" className="ap-link">
              View <Icon name="arrow" size={15} />
            </Link>
          </div>
          {ongoing.trips.length === 0 ? (
            <p className="ap-empty-sm">No vehicle is out today.</p>
          ) : (
            <ul className="ap-rows">
              {ongoing.trips.map((t) => (
                <TripLine key={t.id} t={t} />
              ))}
            </ul>
          )}
        </section>
        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Coming up (next 14 days)</h2>
            <Link href="/admin/expenses/bookings?view=upcoming" className="ap-link">
              All upcoming <Icon name="arrow" size={15} />
            </Link>
          </div>
          {nextTrips.length === 0 ? (
            <p className="ap-empty-sm">No bookings in the next two weeks.</p>
          ) : (
            <ul className="ap-rows">
              {nextTrips.map((t) => (
                <TripLine key={t.id} t={t} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
