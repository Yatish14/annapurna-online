import type { SearchParams } from "../../filters";
import CostPage from "../CostPage";

export const metadata = { title: "Repairs · Expense Tracker" };

export default function RepairsPage({ searchParams }: { searchParams: SearchParams }) {
  return <CostPage kind="repair" searchParams={searchParams} />;
}
