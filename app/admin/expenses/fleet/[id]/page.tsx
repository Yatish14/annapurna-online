import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import Pagination from "@/components/admin/Pagination";
import Expenses from "@/components/expenses/Expenses";
import EditableHeader from "@/components/expenses/EditableHeader";
import FleetActions, { FleetStatus } from "@/components/expenses/FleetActions";
import VehicleFinancePanels from "@/components/expenses/VehicleFinance";
import { getFinance } from "@/lib/expenses/finance";
import { requireUser, can } from "@/lib/auth";
import { fmtRange, fmtShort, todayIST } from "@/lib/dates";
import { getVehicle } from "@/lib/expenses/fleet";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import { PHASE_LABELS, routeText, vehicleExpenses, vehicleTrips } from "@/lib/expenses/trips";
import { pageCount, PAGE_SIZE, parsePage } from "@/lib/pagination";
import { readParams, type SearchParams } from "../../../filters";
import { editVehicle, vehicleStatus } from "../actions";

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
  // Each list has its own page number in the URL (?fuel=2&repairs=1&fastag=1&emi=1&insurance=1)
  const LISTS = ["fuel", "repairs", "fastag", "emi", "insurance"] as const;
  const pages = Object.fromEntries(LISTS.map((k) => [k, parsePage(query.get(k))])) as Record<(typeof LISTS)[number], number>;

  const [fuel, repairs, fastag, emi, insurance, finance, trips] = await Promise.all([
    vehicleExpenses(vehicle.id, "fuel", { page: pages.fuel, pageSize: PAGE_SIZE }),
    vehicleExpenses(vehicle.id, "repair", { page: pages.repairs, pageSize: PAGE_SIZE }),
    vehicleExpenses(vehicle.id, "fastag", { page: pages.fastag, pageSize: PAGE_SIZE }),
    vehicleExpenses(vehicle.id, "emi", { page: pages.emi, pageSize: PAGE_SIZE }),
    vehicleExpenses(vehicle.id, "insurance", { page: pages.insurance, pageSize: PAGE_SIZE }),
    getFinance(vehicle.id),
    vehicleTrips(vehicle.id, 8),
  ]);
  if (!finance) notFound();
  const base = `/admin/expenses/fleet/${vehicle.id}`;
  const href = (key: (typeof LISTS)[number], n: number) => {
    const p = new URLSearchParams();
    for (const k of LISTS) {
      const page = k === key ? n : pages[k];
      if (page > 1) p.set(k, String(page));
    }
    return `${base}${p.size ? `?${p}` : ""}#${key}`;
  };

  const tiles = [
    { label: "Bookings", value: String(vehicle.trips) },
    { label: "Km travelled", value: formatNumber(vehicle.km) },
    { label: "Fuel", value: formatRupees(vehicle.fuel) },
    { label: "Tolls & other", value: formatRupees(vehicle.other) },
    { label: "Repairs", value: formatRupees(vehicle.repairs) },
    { label: "FASTag", value: formatRupees(vehicle.fastag) },
    { label: "EMI paid", value: formatRupees(finance.emi_paid_total) },
    { label: "Insurance paid", value: formatRupees(finance.insurance_paid_total) },
  ];

  return (
    <main className="ap-page">
      <Link href="/admin/expenses/fleet" className="ap-link xp-back">
        <Icon name="arrow" size={15} className="xp-flip" /> Vehicles & drivers
      </Link>
      <EditableHeader
        // A new name starts the header fresh (out of edit mode)
        key={vehicle.name}
        eyebrow="Expense Tracker · Vehicle"
        title={vehicle.name}
        subtitle="Loan, insurance, fuel, repairs and FASTag. Fuel includes what was filled on its bookings and what was added to the vehicle directly."
        id={vehicle.id}
        fields={[{ name: "name", label: "Vehicle name", value: vehicle.name }]}
        action={editVehicle}
        canEdit={canManage}
        editLabel="Edit name"
      >
        {vehicle.is_sample && <span className="ap-badge is-sample">Sample</span>}
        <FleetStatus active={vehicle.active} onTrip={vehicle.on_trip} />
        {canManage && (
          <FleetActions
            id={vehicle.id}
            name={vehicle.name}
            kind="vehicle"
            active={vehicle.active}
            used={vehicle.used}
            statusAction={vehicleStatus}
          />
        )}
      </EditableHeader>
      {!vehicle.active && (
        <p className="ap-alert ap-alert-warn">This vehicle is switched off: it can&apos;t be picked for new bookings. Its history is kept.</p>
      )}
      <Flash params={query} floating />

      <section className="xp-sumtiles">
        {tiles.map((t) => (
          <div key={t.label} className="xp-sumtile is-navy">
            <span>{t.label}</span>
            <strong>{t.value}</strong>
          </div>
        ))}
      </section>

      <VehicleFinancePanels
        finance={finance}
        emiEntries={emi.expenses}
        insuranceEntries={insurance.expenses}
        canManage={canManage}
        emiFooter={<Pagination page={pages.emi} totalPages={pageCount(emi.total)} href={(n) => href("emi", n)} summary={`${emi.total} EMI payments`} />}
        insuranceFooter={
          <Pagination page={pages.insurance} totalPages={pageCount(insurance.total)} href={(n) => href("insurance", n)} summary={`${insurance.total} premiums`} />
        }
      />

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
              page={pages.fuel}
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
          footer={
            <Pagination
              page={pages.repairs}
              totalPages={pageCount(repairs.total)}
              href={(n) => href("repairs", n)}
              summary={`${repairs.total} repairs`}
            />
          }
        />
        <Expenses
          kind="fastag"
          entries={fastag.expenses}
          sum={fastag.sum}
          target={{ vehicleId: vehicle.id }}
          canManage={canManage}
          canAdd={true}
          today={todayIST()}
          footer={
            <Pagination
              page={pages.fastag}
              totalPages={pageCount(fastag.total)}
              href={(n) => href("fastag", n)}
              summary={`${fastag.total} recharges`}
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
              <li key={t.id} className="ap-row xp-rowlink">
                <span className="ap-datechip">
                  <strong>{Number(t.start_date.slice(8))}</strong>
                  <small>{fmtShort(t.start_date).slice(-3)}</small>
                </span>
                <div className="ap-row-main">
                  <Link href={`/admin/expenses/bookings/${t.trip_no}`} className="xp-cardlink">
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
