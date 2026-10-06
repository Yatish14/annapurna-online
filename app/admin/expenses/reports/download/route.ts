import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { buildReport, isReportType, monthLabel, REPORTS } from "@/lib/expenses/reports";

/** /admin/expenses/reports/download?type=bookings&month=2026-10 → CSV file (signed-in users only) */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const type = req.nextUrl.searchParams.get("type");
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isReportType(type) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new NextResponse("Unknown report or month.", { status: 400 });
  }

  const report = await buildReport(type, month);
  await logActivity(user, "report.downloaded", monthLabel(month), `${REPORTS[type].title} report · ${report.count} row${report.count === 1 ? "" : "s"}`);

  return new NextResponse(toCsv(report.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
