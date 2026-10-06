import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import TripForm, { EMPTY_TRIP } from "@/components/expenses/TripForm";
import { requireUser } from "@/lib/auth";
import { fleetChoices } from "@/lib/expenses/fleet";
import { getTrip } from "@/lib/expenses/trips";

type Params = Promise<{ tripNo: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  return { title: `Edit ${(await params).tripNo}` };
}

export default async function EditTripPage({ params }: { params: Params }) {
  await requireUser("manageExpenses");
  const { tripNo } = await params;
  const [trip, { vehicles, drivers }] = await Promise.all([getTrip(decodeURIComponent(tripNo)), fleetChoices()]);
  if (!trip) notFound();
  const back = `/admin/expenses/bookings/${trip.trip_no}`;
  if (trip.status === "cancelled") redirect(`${back}?flash=trip-not-active`);

  return (
    <main className="ap-page xp-formpage">
      <Link href={back} className="ap-link xp-back">
        <Icon name="arrow" size={15} className="xp-flip" /> Back to {trip.trip_no}
      </Link>
      <PageHeader
        eyebrow="Expense Tracker"
        title={`Edit ${trip.trip_no}`}
        subtitle="Readings, amounts, payments and costs are changed on the booking's page."
      />
      <TripForm
        tripId={trip.id}
        initial={{
          ...EMPTY_TRIP,
          vehicle_id: String(trip.vehicle_id),
          driver_id: String(trip.driver_id),
          customer_name: trip.customer_name,
          customer_phone: trip.customer_phone,
          start_date: trip.start_date,
          end_date: trip.end_date,
          pickup_state: trip.pickup_state,
          pickup_city: trip.pickup_city,
          drop_state: trip.round_trip ? "" : trip.drop_state,
          drop_city: trip.round_trip ? "" : trip.drop_city,
          round_trip: trip.round_trip,
          dest_state: trip.dest_state ?? "",
          dest_city: trip.dest_city ?? "",
          referrer_name: trip.referrer_name ?? "",
          referrer_phone: trip.referrer_phone ?? "",
          notes: trip.notes ?? "",
        }}
        vehicles={vehicles}
        drivers={drivers}
        cancelHref={back}
      />
    </main>
  );
}
