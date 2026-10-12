import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { buildReportPdf } from "@/lib/expenses/report-pdf";
import { buildReport, isReportTab, monthLabel, pdfName } from "@/lib/expenses/reports";

/**
 * /admin/expenses/reports/pdf?month=2026-10&tab=drivers → that month's report as a PDF (signed-in users only).
 * Tabs: bookings, drivers, vehicles.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new NextResponse("Unknown month.", { status: 400 });
  }
  const tab = req.nextUrl.searchParams.get("tab");
  if (!isReportTab(tab)) {
    return new NextResponse("Unknown report.", { status: 400 });
  }

  const report = await buildReport(tab, month);
  const pdf = await buildReportPdf(report);
  await logActivity(user, "report.downloaded", monthLabel(month), `${report.title} (PDF) · ${report.contents}`);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfName(tab, month)}"`,
      "Cache-Control": "no-store",
    },
  });
}
