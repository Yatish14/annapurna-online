import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import TripForm from "@/components/expenses/TripForm";
import { EMPTY_TRIP } from "@/components/expenses/tripFormValues";
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
        subtitle="Change the details, amounts and km, or add a payment or fuel. To correct or remove a payment or cost, use the booking's page."
      />
      <TripForm
        tripId={trip.id}
        soFar={{ received: trip.received, fuel: trip.fuel }}
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
          // Money and km as saved (payments and fuel are added, not edited, here)
          total_amount: trip.total_amount === null ? "" : String(trip.total_amount),
          driver_amount: trip.driver_amount === null ? "" : String(trip.driver_amount),
          odometer_start: trip.odometer_start === null ? "" : String(trip.odometer_start),
          odometer_end: trip.odometer_end === null ? "" : String(trip.odometer_end),
          km_direct_on: trip.km_direct !== null && trip.odometer_start === null,
          km_direct: trip.km_direct === null ? "" : String(trip.km_direct),
        }}
        vehicles={vehicles}
        drivers={drivers}
        cancelHref={back}
      />
    </main>
  );
}
