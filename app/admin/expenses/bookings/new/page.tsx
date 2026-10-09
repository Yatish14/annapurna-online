import Link from "next/link";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import TripForm, { EMPTY_TRIP } from "@/components/expenses/TripForm";
import { requireUser } from "@/lib/auth";
import { fleetChoices } from "@/lib/expenses/fleet";

export const metadata = { title: "New booking · Expense Tracker" };

export default async function NewTripPage() {
  await requireUser("manageExpenses");
  const { vehicles, drivers } = await fleetChoices();

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
      <TripForm initial={EMPTY_TRIP} vehicles={vehicles} drivers={drivers} cancelHref="/admin/expenses/bookings" />
    </main>
  );
}
