import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { buildReport, isReportType, monthLabel } from "@/lib/expenses/reports";

/**
 * /admin/expenses/reports/download?month=2026-10&type=drivers → that report as a CSV file (signed-in users only).
 * Types: bookings, drivers, repairs.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new NextResponse("Unknown month.", { status: 400 });
  }
  const type = req.nextUrl.searchParams.get("type");
  if (!isReportType(type)) {
    return new NextResponse("Unknown report.", { status: 400 });
  }

  const report = await buildReport(type, month);
  await logActivity(user, "report.downloaded", monthLabel(month), `${report.title} · ${report.contents}`);

  return new NextResponse(toCsv(report.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
