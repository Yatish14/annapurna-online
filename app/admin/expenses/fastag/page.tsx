import type { SearchParams } from "../../filters";
import CostPage from "../CostPage";

export const metadata = { title: "FASTag · Expense Tracker" };

export default function FastagPage({ searchParams }: { searchParams: SearchParams }) {
  return <CostPage kind="fastag" searchParams={searchParams} />;
}
