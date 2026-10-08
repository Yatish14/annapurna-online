import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { formatRupees } from "@/lib/expenses/money";
import { buildStatementPdf } from "@/lib/expenses/statement";
import { balanceOf, getTrip, listPayments } from "@/lib/expenses/trips";

/** /admin/expenses/bookings/VB-0001/statement → the customer's expense statement as a PDF (signed-in users only) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ tripNo: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const trip = await getTrip(decodeURIComponent((await params).tripNo));
  if (!trip) return new NextResponse("This booking doesn't exist.", { status: 404 });
  if (trip.status !== "booked") return new NextResponse("This booking is cancelled.", { status: 400 });
  if (trip.total_amount === null) return new NextResponse("Enter the total from the customer first.", { status: 400 });

  const payments = await listPayments(trip.id);
  const generatedAt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const pdf = await buildStatementPdf(trip, payments, generatedAt);
  const balance = balanceOf(trip);
  await logActivity(user, "trip.statement_downloaded", trip.trip_no, balance > 0 ? `Balance ${formatRupees(balance)}` : "Fully paid");

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="expense-statement-${trip.trip_no}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
