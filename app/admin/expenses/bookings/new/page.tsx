import Link from "next/link";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import TripForm from "@/components/expenses/TripForm";
import { EMPTY_TRIP, valuesFromDraft } from "@/components/expenses/tripFormValues";
import { getDraft } from "@/lib/assistant/draftStore";
import { requireUser } from "@/lib/auth";
import { fleetChoices } from "@/lib/expenses/fleet";
import type { SearchParams } from "../../../filters";

export const metadata = { title: "New booking · Expense Tracker" };

export default async function NewTripPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("manageExpenses");
  const { vehicles, drivers } = await fleetChoices();

  // ?draft=…: "Open in form" on an Annapurna Assist draft (4.8). The address has only the draft's id; its values
  // come from the server, and only for the admin who asked for it (another admin's draft is "not found").
  const { draft: param } = await searchParams;
  const draftId = typeof param === "string" ? param : null;
  const draft = draftId ? await getDraft(draftId, user.id) : null;
  const fill = draft && draft.kind === "booking" && draft.status !== "confirmed" ? draft : null;

  return (
    <main className="ap-page xp-formpage">
      <Link href="/admin/expenses/bookings" className="ap-link xp-back">
        <Icon name="arrow" size={15} className="xp-flip" /> All bookings
      </Link>
      <PageHeader
        eyebrow="Expense Tracker"
        title="New booking"
        subtitle="Kilometres, payments and fuel can also be added on the booking's page afterwards."
      />
      {fill && (
        <p className="ap-note">
          <Icon name="sparkle" size={16} /> Filled in from Annapurna Assist&apos;s draft. Check it, change anything you
          need, then press Create booking.
        </p>
      )}
      {draft?.status === "confirmed" && (
        <p className="ap-note ap-note-ok">
          <Icon name="check" size={16} /> That draft is already saved
          {draft.result && (
            <>
              {" "}
              as{" "}
              <Link href={`/admin/expenses/bookings/${draft.result}`} className="ap-link">
                {draft.result}
              </Link>
            </>
          )}
          .
        </p>
      )}
      {draftId && !draft && <p className="ap-note ap-note-warn">That draft wasn&apos;t found, so the form is empty.</p>}
      <TripForm
        initial={fill ? valuesFromDraft(fill.fields) : EMPTY_TRIP}
        vehicles={vehicles}
        drivers={drivers}
        cancelHref="/admin/expenses/bookings"
        fromDraft={fill?.id}
      />
    </main>
  );
}
