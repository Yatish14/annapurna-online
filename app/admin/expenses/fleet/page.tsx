import Link from "next/link";
import Flash from "@/components/admin/Flash";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import SubmitButton from "@/components/admin/SubmitButton";
import MobileInput from "@/components/MobileInput";
import { can, requireUser } from "@/lib/auth";
import { listDrivers, listVehicles } from "@/lib/expenses/fleet";
import { formatNumber, formatRupees } from "@/lib/expenses/money";
import { formatPhone } from "@/lib/format";
import { readParams, type SearchParams } from "../../filters";
import { addDriver, addVehicle, driverStatus, editDriver, editVehicle, vehicleStatus } from "./actions";

export const metadata = { title: "Vehicles & drivers" };

function Status({ active, onTrip }: { active: boolean; onTrip: string | null }) {
  if (!active) return <span className="xp-state is-off">Switched off</span>;
  if (onTrip)
    return (
      <Link href={`/admin/expenses/bookings/${onTrip}`} className="xp-state is-out">
        On trip · {onTrip}
      </Link>
    );
  return <span className="xp-state is-free">Available</span>;
}

/** Edit / switch off / delete buttons of a vehicle or driver */
function RowActions({
  id,
  name,
  active,
  used,
  statusAction,
  children,
}: {
  id: number;
  name: string;
  active: boolean;
  used: boolean;
  statusAction: (fd: FormData) => Promise<void>;
  /** The edit form */
  children: React.ReactNode;
}) {
  return (
    <div className="xp-rowactions">
      <details className="ap-reset">
        <summary className="ap-btn ap-btn-ghost ap-btn-sm">
          <Icon name="edit" size={13} /> Edit
        </summary>
        {children}
      </details>
      <form action={statusAction}>
        <input type="hidden" name="id" value={id} />
        {used ? (
          <>
            <input type="hidden" name="action" value={active ? "deactivate" : "activate"} />
            <SubmitButton
              className="ap-btn ap-btn-ghost ap-btn-sm"
              confirm={active ? `Switch off ${name}? It won't appear for new bookings. Its history stays.` : undefined}
            >
              <Icon name={active ? "pause" : "play"} size={13} /> {active ? "Switch off" : "Switch on"}
            </SubmitButton>
          </>
        ) : (
          <>
            <input type="hidden" name="action" value="delete" />
            <SubmitButton className="ap-btn ap-btn-danger ap-btn-sm" confirm={`Delete ${name}? This can't be undone.`}>
              <Icon name="trash" size={13} /> Delete
            </SubmitButton>
          </>
        )}
      </form>
    </div>
  );
}

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
        subtitle="The cars and drivers that can be picked when creating a booking."
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
            <span className="ap-muted">
              {vehicles.filter((v) => v.active).length} in use
            </span>
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
                <li key={v.id} className={v.active ? "" : "is-off"}>
                  <span className="xp-fleeticon">
                    <Icon name="car" size={20} />
                  </span>
                  <div className="xp-fleetmain">
                    <span>
                      <Link href={`/admin/expenses/fleet/${v.id}`} className="xp-fleetname">
                        {v.name}
                      </Link>
                      {v.is_sample && <span className="ap-badge is-sample xp-samplebadge">Sample</span>}
                    </span>
                    <span className="ap-muted">
                      {v.trips} booking{v.trips === 1 ? "" : "s"} · {formatNumber(v.km)} km · Fuel {formatRupees(v.fuel)} · Repairs{" "}
                      {formatRupees(v.repairs)}
                    </span>
                  </div>
                  <Status active={v.active} onTrip={v.on_trip} />
                  {canManage && (
                    <RowActions id={v.id} name={v.name} active={v.active} used={v.used} statusAction={vehicleStatus}>
                      <form action={editVehicle} className="ap-reset-form">
                        <input type="hidden" name="id" value={v.id} />
                        <input name="name" required minLength={2} maxLength={60} defaultValue={v.name} aria-label="Vehicle name" />
                        <SubmitButton className="ap-btn ap-btn-gold ap-btn-sm">Save</SubmitButton>
                      </form>
                    </RowActions>
                  )}
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
                <li key={d.id} className={d.active ? "" : "is-off"}>
                  <span className="xp-fleeticon">
                    <Icon name="steering" size={20} />
                  </span>
                  <div className="xp-fleetmain">
                    <span>
                      <strong className="xp-fleetname">{d.name}</strong>
                      {d.is_sample && <span className="ap-badge is-sample xp-samplebadge">Sample</span>}
                    </span>
                    <span className="ap-muted">
                      <a href={`tel:+91${d.phone}`}>{formatPhone(d.phone)}</a> · {d.trips} booking{d.trips === 1 ? "" : "s"}
                      {d.owed > 0 && <b className="xp-owed"> · {formatRupees(d.owed)} to pay</b>}
                    </span>
                  </div>
                  <Status active={d.active} onTrip={d.on_trip} />
                  {canManage && (
                    <RowActions id={d.id} name={d.name} active={d.active} used={d.used} statusAction={driverStatus}>
                      <form action={editDriver} className="ap-reset-form xp-editdriver">
                        <input type="hidden" name="id" value={d.id} />
                        <input name="name" required minLength={2} maxLength={60} defaultValue={d.name} aria-label="Driver name" />
                        <MobileInput name="phone" required autoComplete="off" defaultValue={d.phone} />
                        <SubmitButton className="ap-btn ap-btn-gold ap-btn-sm">Save</SubmitButton>
                      </form>
                    </RowActions>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
