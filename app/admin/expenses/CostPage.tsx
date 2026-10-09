import Link from "next/link";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import LinkPending from "@/components/admin/LinkPending";
import PageHeader from "@/components/admin/PageHeader";
import Pagination from "@/components/admin/Pagination";
import Expenses from "@/components/expenses/Expenses";
import { can, requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/dates";
import { fleetChoices } from "@/lib/expenses/fleet";
import { formatRupees } from "@/lib/expenses/money";
import { monthLabel } from "@/lib/expenses/reports";
import { listCosts } from "@/lib/expenses/trips";
import { pageCount, PAGE_SIZE, parsePage } from "@/lib/pagination";
import { parseMonth, readParams, type SearchParams } from "../filters";

const shiftMonth = (m: string, by: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + by, 1)).toISOString().slice(0, 7);

const PAGES = {
  repair: {
    path: "/admin/expenses/repairs",
    title: "Repairs",
    subtitle: "Repairs and servicing of every vehicle: engine oil, tyres, AC and other work. They belong to the vehicle, not a booking.",
    noun: ["repair", "repairs"],
    report: true,
  },
  fastag: {
    path: "/admin/expenses/fastag",
    title: "FASTag",
    subtitle: "FASTag recharges of every vehicle. They count as the vehicle's costs in the Overview and Reports.",
    noun: ["recharge", "recharges"],
    report: false,
  },
} as const;

/** The Repairs and FASTag pages: one month of entries over every vehicle (or one), each vehicle's total, and adding */
export default async function CostPage({ kind, searchParams }: { kind: "repair" | "fastag"; searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "manageExpenses");
  const params = await readParams(searchParams);
  const month = parseMonth(params);
  const page = parsePage(params.get("page"));
  const vehicleParam = Number(params.get("vehicle"));
  const vehicleId = Number.isSafeInteger(vehicleParam) && vehicleParam > 0 ? vehicleParam : null;
  const info = PAGES[kind];

  const [{ expenses, total, sum, byVehicle }, { vehicles }] = await Promise.all([
    listCosts(kind, { month, vehicleId, page, pageSize: PAGE_SIZE }),
    fleetChoices(),
  ]);
  const chosen = vehicleId !== null ? vehicles.find((v) => v.id === vehicleId) : undefined;
  const monthTotal = byVehicle.reduce((acc, v) => acc + v.amount, 0);
  const monthEntries = byVehicle.reduce((acc, v) => acc + v.entries, 0);
  const href = (change: { month?: string; vehicle?: number | null; page?: number }) => {
    const p = new URLSearchParams();
    const m = change.month ?? month;
    const v = "vehicle" in change ? change.vehicle : vehicleId;
    if (m !== todayIST().slice(0, 7)) p.set("month", m);
    if (v) p.set("vehicle", String(v));
    if (change.page && change.page > 1) p.set("page", String(change.page));
    return `${info.path}${p.size ? `?${p}` : ""}`;
  };
  const [one, many] = info.noun;

  return (
    <main className="ap-page">
      <PageHeader eyebrow="Expense Tracker" title={info.title} subtitle={info.subtitle}>
        <nav className="ap-cal-nav" aria-label="Month">
          <Link href={href({ month: shiftMonth(month, -1), page: 1 })} aria-label="Previous month" scroll={false}>
            ‹<LinkPending />
          </Link>
          <strong>{monthLabel(month)}</strong>
          <Link href={href({ month: shiftMonth(month, 1), page: 1 })} aria-label="Next month" scroll={false}>
            ›<LinkPending />
          </Link>
        </nav>
      </PageHeader>
      <Flash params={params} floating />
      {month !== todayIST().slice(0, 7) && (
        <p className="ap-note ap-note-warn xp-monthnote">
          Showing {monthLabel(month)}.{" "}
          <Link href={href({ month: todayIST().slice(0, 7), page: 1 })} className="ap-link">
            Back to this month
          </Link>
        </p>
      )}

      <section className="xp-sumtiles xp-sumtiles-4">
        <div className="xp-sumtile is-gold">
          <span>Total in {monthLabel(month)}</span>
          <strong>{formatRupees(monthTotal)}</strong>
        </div>
        <div className="xp-sumtile is-navy">
          <span>{info.title === "FASTag" ? "Recharges" : "Repairs"}</span>
          <strong>{monthEntries}</strong>
        </div>
        <div className="xp-sumtile is-navy">
          <span>Vehicles</span>
          <strong>{byVehicle.length}</strong>
        </div>
        <div className="xp-sumtile is-plum">
          <span>Most spent on</span>
          <strong>{byVehicle[0] ? byVehicle[0].vehicle_name : "—"}</strong>
        </div>
      </section>

      {vehicles.length > 1 && (
        <nav className="ap-pills xp-costpills" aria-label="Vehicle">
          <Link href={href({ vehicle: null, page: 1 })} scroll={false} className={vehicleId === null ? "is-active" : ""}>
            All vehicles
          </Link>
          {vehicles
            .filter((v) => v.active || v.id === vehicleId || byVehicle.some((b) => b.vehicle_id === v.id))
            .map((v) => (
              <Link key={v.id} href={href({ vehicle: v.id, page: 1 })} scroll={false} className={vehicleId === v.id ? "is-active" : ""}>
                {v.name}
              </Link>
            ))}
        </nav>
      )}

      <div className="xp-detail">
        <Expenses
          kind={kind}
          title={`${chosen ? `${chosen.name} · ` : ""}${monthLabel(month)}`}
          entries={expenses}
          sum={sum}
          target={{ vehicles: vehicles.filter((v) => v.active) }}
          canManage={canManage}
          canAdd={true}
          today={todayIST()}
          showVehicle={!chosen}
          footer={
            <Pagination
              page={page}
              totalPages={pageCount(total)}
              href={(n) => href({ page: n })}
              summary={`${total} ${total === 1 ? one : many}`}
            />
          }
        />

        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>By vehicle</h2>
            {info.report ? (
              <a className="ap-link" href={`/admin/expenses/reports/download?month=${month}&type=repairs`} download>
                <Icon name="download" size={15} /> Repairs report
              </a>
            ) : (
              <Link className="ap-link" href={`/admin/expenses/reports?month=${month}`}>
                Reports <Icon name="arrow" size={15} />
              </Link>
            )}
          </div>
          {byVehicle.length === 0 ? (
            <p className="ap-empty-sm">Nothing in {monthLabel(month)}.</p>
          ) : (
            <ul className="ap-rows">
              {byVehicle.map((v) => (
                <li key={v.vehicle_id} className="ap-row xp-rowlink">
                  <div className="ap-row-main">
                    <Link href={href({ vehicle: v.vehicle_id, page: 1 })} className="xp-cardlink" scroll={false}>
                      <strong>{v.vehicle_name}</strong>
                    </Link>
                    <span>
                      {v.entries} {v.entries === 1 ? one : many}
                    </span>
                  </div>
                  <b className="xp-nowrap">{formatRupees(v.amount)}</b>
                </li>
              ))}
            </ul>
          )}
          {canManage && vehicles.every((v) => !v.active) && (
            <p className="ap-hint">
              Add a vehicle in <Link href="/admin/expenses/fleet" className="ap-link">Vehicles &amp; drivers</Link> first.
            </p>
          )}
          <p className="ap-hint">
            Counted on the date of each {one}. Removed entries stay listed, crossed out, but aren&apos;t counted.
          </p>
        </section>
      </div>
    </main>
  );
}
