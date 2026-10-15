import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { buildReportPdf } from "@/lib/expenses/report-pdf";
import { buildReports, isReportView, monthLabel, pdfName, viewTitle } from "@/lib/expenses/reports";

/**
 * /admin/expenses/reports/pdf?month=2026-10&tab=drivers → that month's report as a PDF (signed-in users only).
 * Tabs: all (every report, one after another), bookings, customers, drivers, vehicles.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new NextResponse("Unknown month.", { status: 400 });
  }
  const view = req.nextUrl.searchParams.get("tab");
  if (!isReportView(view)) {
    return new NextResponse("Unknown report.", { status: 400 });
  }

  const reports = await buildReports(view, month);
  const pdf = await buildReportPdf(reports, viewTitle(view));
  await logActivity(user, "report.downloaded", monthLabel(month), `${viewTitle(view)} (PDF) · ${reports.map((r) => r.contents).join("; ")}`);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfName(view, month)}"`,
      "Cache-Control": "no-store",
    },
  });
}
