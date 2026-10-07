import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { buildMonthlyReport, monthLabel } from "@/lib/expenses/reports";

/** /admin/expenses/reports/download?month=2026-10 → the month's report as a CSV file (signed-in users only) */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new NextResponse("Unknown month.", { status: 400 });
  }

  const report = await buildMonthlyReport(month);
  const { bookings, payments, costs } = report.counts;
  await logActivity(
    user,
    "report.downloaded",
    monthLabel(month),
    `Monthly report · ${bookings} booking${bookings === 1 ? "" : "s"}, ${payments} payment${payments === 1 ? "" : "s"}, ${costs} cost${costs === 1 ? "" : "s"}`,
  );

  return new NextResponse(toCsv(report.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
