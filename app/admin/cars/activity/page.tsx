import ActivityFeed from "@/components/admin/ActivityFeed";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { parsePage } from "@/lib/pagination";
import { readParams, type SearchParams } from "../../filters";

export const metadata = { title: "Car bookings activity" };

export default async function CarActivityPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("viewActivity");
  const params = await readParams(searchParams);

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Car Bookings"
        title="Activity"
        subtitle="Every WhatsApp enquiry and every booking change, plus team changes: who, what and when."
      />
      <ActivityFeed
        module="cars"
        path="/admin/cars/activity"
        moduleLabel="Bookings"
        filter={params.get("type")}
        page={parsePage(params.get("page"))}
        emptyText="Nothing has happened yet. Enquiries and booking changes will appear here."
      />
    </main>
  );
}
