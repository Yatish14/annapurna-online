import Link from "next/link";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import SubmitButton from "@/components/admin/SubmitButton";
import { FleetStatus } from "@/components/expenses/FleetActions";
import MobileInput from "@/components/MobileInput";
import { can, requireUser } from "@/lib/auth";
import { listDrivers, listVehicles } from "@/lib/expenses/fleet";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import { formatPhone } from "@/lib/format";
import { readParams, type SearchParams } from "../../filters";
import { addDriver, addVehicle } from "./actions";

export const metadata = { title: "Vehicles & drivers" };

export default async function FleetPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const canManage = can(user, "manageExpenses");
  const params = await readParams(searchParams);
  const [vehicles, drivers] = await Promise.all([listVehicles(), listDrivers()]);

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Expense Tracker"
        title="Vehicles & drivers"
        subtitle="The cars and drivers that can be picked when creating a booking. Open one to see its details, edit it or switch it off."
      />
      <Flash params={params} />
      {!canManage && (
        <p className="ap-note ap-note-warn">
          <Icon name="eye" size={14} /> View only: adding or changing vehicles and drivers is for admins.
        </p>
      )}

      <div className="xp-fleet">
        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Vehicles</h2>
            <span className="ap-muted">{vehicles.filter((v) => v.active).length} in use</span>
          </div>

          {canManage && (
            <form action={addVehicle} className="xp-addrow">
              <label className="ap-field">
                <span>New vehicle (car)</span>
                <input name="name" required minLength={2} maxLength={60} autoComplete="off" placeholder="e.g. Innova Crysta (white)" />
              </label>
              <SubmitButton className="ap-btn ap-btn-gold">
                <Icon name="plus" size={15} /> Add vehicle
              </SubmitButton>
            </form>
          )}

          {vehicles.length === 0 ? (
            <p className="ap-empty-sm">No vehicles yet. Add your first car above.</p>
          ) : (
            <ul className="xp-fleetlist">
              {vehicles.map((v) => (
                <li key={v.id} className={`xp-rowlink ${v.active ? "" : "is-off"}`}>
                  <span className="xp-fleeticon">
                    <Icon name="car" size={20} />
                  </span>
                  <div className="xp-fleetmain">
                    <span>
                      {/* Stretched over the row: clicking anywhere on it opens the vehicle */}
                      <Link href={`/admin/expenses/fleet/${v.id}`} className="xp-fleetname xp-cardlink">
                        {v.name}
                      </Link>
                      {v.is_sample && <span className="ap-badge is-sample xp-samplebadge">Sample</span>}
                    </span>
                    <span className="ap-muted">
                      {v.trips} booking{v.trips === 1 ? "" : "s"} · {formatNumber(v.km)} km · Fuel {formatRupees(v.fuel)} · Repairs{" "}
                      {formatRupees(v.repairs)}
                    </span>
                  </div>
                  <FleetStatus active={v.active} onTrip={v.on_trip} />
                  <Icon name="chevron" size={18} className="xp-rowchevron" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ap-panel">
          <div className="ap-panel-head">
            <h2>Drivers</h2>
            <span className="ap-muted">{drivers.filter((d) => d.active).length} in use</span>
          </div>

          {canManage && (
            <form action={addDriver} className="xp-addrow xp-addrow-2">
              <label className="ap-field">
                <span>Driver name</span>
                <input name="name" required minLength={2} maxLength={60} autoComplete="off" placeholder="e.g. Suresh" />
              </label>
              <label className="ap-field">
                <span>Mobile number</span>
                <MobileInput name="phone" required autoComplete="off" />
              </label>
              <SubmitButton className="ap-btn ap-btn-gold">
                <Icon name="plus" size={15} /> Add driver
              </SubmitButton>
            </form>
          )}

          {drivers.length === 0 ? (
            <p className="ap-empty-sm">No drivers yet. Add a driver above.</p>
          ) : (
            <ul className="xp-fleetlist">
              {drivers.map((d) => (
                <li key={d.id} className={`xp-rowlink ${d.active ? "" : "is-off"}`}>
                  <span className="xp-fleeticon">
                    <Icon name="steering" size={20} />
                  </span>
                  <div className="xp-fleetmain">
                    <span>
                      <Link href={`/admin/expenses/fleet/drivers/${d.id}`} className="xp-fleetname xp-cardlink">
                        {d.name}
                      </Link>
                      {d.is_sample && <span className="ap-badge is-sample xp-samplebadge">Sample</span>}
                    </span>
                    <span className="ap-muted">
                      <a href={`tel:+91${d.phone}`}>{formatPhone(d.phone)}</a> · {d.trips} booking{d.trips === 1 ? "" : "s"}
                      {d.owed > 0 && <b className="xp-owed"> · {formatRupees(d.owed)} to pay</b>}
                    </span>
                  </div>
                  <FleetStatus active={d.active} onTrip={d.on_trip} />
                  <Icon name="chevron" size={18} className="xp-rowchevron" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
