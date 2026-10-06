import ActivityFeed from "@/components/admin/ActivityFeed";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { readParams, type SearchParams } from "../../filters";

export const metadata = { title: "Printout activity" };

export default async function PrintActivityPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("viewActivity");
  const params = await readParams(searchParams);

  return (
    <main className="ap-page">
      <PageHeader
        eyebrow="Printout"
        title="Activity"
        subtitle="Every print order, every print and collection, plus team changes: who, what and when."
      />
      <ActivityFeed
        module="print"
        path="/admin/print/activity"
        moduleLabel="Orders"
        filter={params.get("type")}
        emptyText="Nothing has happened yet. Print orders will appear here once customers start uploading."
      />
    </main>
  );
}
