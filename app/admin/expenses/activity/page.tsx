import ActivityFeed from "@/components/admin/ActivityFeed";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { parsePage } from "@/lib/pagination";
import { readParams, type SearchParams } from "../../filters";

export const metadata = { title: "Expense Tracker activity" };

export default async function ExpensesActivityPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("viewActivity");
  const params = await readParams(searchParams);

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Expense Tracker"
        title="Activity"
        subtitle="Every booking, payment, fuel and repair entry, vehicle and driver change, plus team changes: who, what and when."
      />
      <ActivityFeed
        module="expenses"
        path="/admin/expenses/activity"
        moduleLabel="Bookings & money"
        filter={params.get("type")}
        page={parsePage(params.get("page"))}
        emptyText="Nothing has happened yet. Add your vehicles and drivers, then create a booking."
      />
    </main>
  );
}
