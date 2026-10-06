import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import Pagination from "@/components/admin/Pagination";
import Expenses from "@/components/expenses/Expenses";
import { requireUser, can } from "@/lib/auth";
import { fmtRange, fmtShort, todayIST } from "@/lib/dates";
import { getVehicle } from "@/lib/expenses/fleet";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import { PHASE_LABELS, routeText, vehicleExpenses, vehicleTrips } from "@/lib/expenses/trips";
import { pageCount, PAGE_SIZE, parsePage } from "@/lib/pagination";
import { readParams, type SearchParams } from "../../../filters";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const vehicle = await getVehicle(Number((await params).id));
  return { title: vehicle ? vehicle.name : "Vehicle" };
}

export default async function VehiclePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "manageExpenses");
  const vehicle = await getVehicle(Number((await params).id));
  if (!vehicle) notFound();
  const query = await readParams(searchParams);
  const fuelPage = parsePage(query.get("fuel"));
  const repairPage = parsePage(query.get("repairs"));

  const [fuel, repairs, trips] = await Promise.all([
    vehicleExpenses(vehicle.id, "fuel", { page: fuelPage, pageSize: PAGE_SIZE }),
    vehicleExpenses(vehicle.id, "repair", { page: repairPage, pageSize: PAGE_SIZE }),
    vehicleTrips(vehicle.id, 8),
  ]);
  const base = `/admin/expenses/fleet/${vehicle.id}`;
  const href = (key: "fuel" | "repairs", n: number) => {
    const p = new URLSearchParams();
    if (key === "fuel" ? n > 1 : fuelPage > 1) p.set("fuel", String(key === "fuel" ? n : fuelPage));
    if (key === "repairs" ? n > 1 : repairPage > 1) p.set("repairs", String(key === "repairs" ? n : repairPage));
    return `${base}${p.size ? `?${p}` : ""}#${key}`;
  };

  const tiles = [
    { label: "Bookings", value: String(vehicle.trips) },
    { label: "Km travelled", value: formatNumber(vehicle.km) },
    { label: "Fuel", value: formatRupees(vehicle.fuel) },
    { label: "Repairs", value: formatRupees(vehicle.repairs) },
  ];

  return (
    <main className="ap-page">
      <Link href="/admin/expenses/fleet" className="ap-link xp-back">
        <Icon name="arrow" size={15} className="xp-flip" /> Vehicles & drivers
      </Link>
      <PageHeader
        eyebrow="Expense Tracker · Vehicle"
        title={vehicle.name}
        subtitle="Fuel and repairs here include costs added on its bookings and costs added to the vehicle directly."
      >
        <span className={`xp-state ${!vehicle.active ? "is-off" : vehicle.on_trip ? "is-out" : "is-free"}`}>
          {!vehicle.active ? "Switched off" : vehicle.on_trip ? `On trip · ${vehicle.on_trip}` : "Available"}
        </span>
      </PageHeader>
      <Flash params={query} floating />

      <section className="xp-sumtiles xp-sumtiles-4">
        {tiles.map((t) => (
          <div key={t.label} className="xp-sumtile is-navy">
            <span>{t.label}</span>
            <strong>{t.value}</strong>
          </div>
        ))}
      </section>

      <div className="xp-detail">
        <Expenses
          kind="fuel"
          entries={fuel.expenses}
          sum={fuel.sum}
          target={{ vehicleId: vehicle.id }}
          canManage={canManage}
          canAdd={true}
          today={todayIST()}
          showTrip
          footer={
            <Pagination
              page={fuelPage}
              totalPages={pageCount(fuel.total)}
              href={(n) => href("fuel", n)}
              summary={`${fuel.total} fuel entries`}
            />
          }
        />
        <Expenses
          kind="repair"
          entries={repairs.expenses}
          sum={repairs.sum}
          target={{ vehicleId: vehicle.id }}
          canManage={canManage}
          canAdd={true}
          today={todayIST()}
          showTrip
          footer={
            <Pagination
              page={repairPage}
              totalPages={pageCount(repairs.total)}
              href={(n) => href("repairs", n)}
              summary={`${repairs.total} repairs`}
            />
          }
        />
      </div>

      <section className="ap-panel">
        <div className="ap-panel-head">
          <h2>Latest bookings</h2>
          {vehicle.trips > 0 && (
            <Link href={`/admin/expenses/bookings?q=${encodeURIComponent(vehicle.name)}`} className="ap-link">
              All bookings of this vehicle <Icon name="arrow" size={15} />
            </Link>
          )}
        </div>
        {trips.length === 0 ? (
          <p className="ap-empty-sm">No bookings yet.</p>
        ) : (
          <ul className="ap-rows">
            {trips.map((t) => (
              <li key={t.id} className="ap-row">
                <span className="ap-datechip">
                  <strong>{Number(t.start_date.slice(8))}</strong>
                  <small>{fmtShort(t.start_date).slice(-3)}</small>
                </span>
                <div className="ap-row-main">
                  <Link href={`/admin/expenses/bookings/${t.trip_no}`}>
                    <strong>{t.customer_name}</strong>
                  </Link>
                  <span>
                    {routeText(t)} · {fmtRange(t.start_date, t.end_date)} · {t.driver_name}
                  </span>
                </div>
                <span className={`ap-badge xp-phase is-${t.phase}`}>{PHASE_LABELS[t.phase]}</span>
                <span className="ap-row-ref">{t.trip_no}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
