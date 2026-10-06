import Link from "next/link";
import Icon from "@/components/admin/Icon";
import SubmitButton from "@/components/admin/SubmitButton";

/** "Available", "On trip · VB-1004" or "Switched off" */
export function FleetStatus({ active, onTrip }: { active: boolean; onTrip: string | null }) {
  if (!active) return <span className="xp-state is-off">Switched off</span>;
  if (onTrip)
    return (
      <Link href={`/admin/expenses/bookings/${onTrip}`} className="xp-state is-out">
        On trip · {onTrip}
      </Link>
    );
  return <span className="xp-state is-free">Available</span>;
}

/**
 * Switch a vehicle or driver off / back on, or delete it while nothing refers to it
 * (on its own page; editing the name is done in the page header).
 */
export default function FleetActions({
  id,
  name,
  kind,
  active,
  used,
  statusAction,
}: {
  id: number;
  name: string;
  kind: "vehicle" | "driver";
  active: boolean;
  used: boolean;
  statusAction: (fd: FormData) => Promise<void>;
}) {
  return (
    <form action={statusAction} className="xp-fleetactions">
      <input type="hidden" name="id" value={id} />
      {used ? (
        <>
          <input type="hidden" name="action" value={active ? "deactivate" : "activate"} />
          <SubmitButton
            className="ap-btn ap-btn-ghost ap-btn-sm"
            confirm={
              active
                ? `Switch off ${name}? ${kind === "vehicle" ? "It" : "They"} won't appear for new bookings. The history stays.`
                : undefined
            }
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
  );
}
