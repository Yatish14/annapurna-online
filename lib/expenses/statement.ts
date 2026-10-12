import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { BUSINESS } from "../config";
import { daysText, diffDays, fmtLong, fmtRange, todayIST } from "../dates";
import { formatPhone } from "../format";
import { PRINT_SHOP } from "../print/files";
import { formatRupees, PAYMENT_METHODS } from "./money";
import { embedFonts, fit, GOLD, GREEN, INK, IVORY, LINE, NAVY, RED, SOFT } from "./pdf";
import { balanceOf, type Payment, type Trip } from "./trips";

const PAGE = { width: 595.28, height: 841.89, margin: 48 };

export type StatementTrip = Pick<
  Trip,
  "trip_no" | "customer_name" | "customer_phone" | "start_date" | "end_date" | "total_amount" | "received"
>;

/**
 * A one-page PDF for the customer: what the expenses came to, the payments received and what is still
 * to pay. Called an "expense statement" (not an invoice or bill: there's no GST registration), and kept
 * to amounts: no mention of travels, car hire, the vehicle or the driver.
 */
export async function buildStatementPdf(trip: StatementTrip, payments: Payment[], generatedAt: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await embedFonts(pdf);
  pdf.setTitle(`Expense statement ${trip.trip_no}`);
  pdf.setAuthor(PRINT_SHOP.name);
  pdf.setCreator(PRINT_SHOP.name);

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const text = (s: string, x: number, y: number, size: number, font: PDFFont = regular, color = INK) =>
    page.drawText(s, { x, y, size, font, color });
  const textRight = (s: string, xRight: number, y: number, size: number, font: PDFFont = regular, color = INK) =>
    text(s, xRight - font.widthOfTextAtSize(s, size), y, size, font, color);
  const rule = (y: number, color = LINE, thickness = 1) =>
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness, color });

  // ---------- Header: who it's from, and the statement's reference ----------
  let y = PAGE.height - PAGE.margin - 8;
  text(PRINT_SHOP.name, left, y, 19, bold, NAVY);
  textRight("EXPENSE STATEMENT", right, y + 2, 11, bold, GOLD);
  y -= 18;
  text(`Phone ${BUSINESS.phoneDisplay}  ·  ${BUSINESS.email}`, left, y, 9.5, regular, SOFT);
  textRight(`Ref. ${trip.trip_no}`, right, y, 9.5, regular, SOFT);
  y -= 14;
  textRight(`Date ${fmtLong(todayIST())}`, right, y, 9.5, regular, SOFT);
  y -= 16;
  rule(y, GOLD, 1.5);

  // ---------- To / period ----------
  y -= 26;
  text("TO", left, y, 8, bold, SOFT);
  text("PERIOD", left + 300, y, 8, bold, SOFT);
  y -= 17;
  text(fit(trip.customer_name, bold, 13, 280), left, y, 13, bold, NAVY);
  text(fmtRange(trip.start_date, trip.end_date), left + 300, y, 13, bold, NAVY);
  y -= 16;
  text(formatPhone(trip.customer_phone), left, y, 10, regular, INK);
  text(daysText(diffDays(trip.start_date, trip.end_date) + 1), left + 300, y, 10, regular, INK);

  // ---------- Expenses ----------
  y -= 34;
  y = tableHeader(page, bold, y, left, right, ["Details", "Amount"]);
  y -= 20;
  text(`Expenses for ${fmtRange(trip.start_date, trip.end_date)}`, left + 10, y, 10.5);
  textRight(formatRupees(trip.total_amount ?? 0), right - 10, y, 10.5, bold, NAVY);
  y -= 12;
  rule(y);

  // ---------- Payments received ----------
  const received = payments.filter((p) => p.party === "customer" && !p.deleted_ist);
  y -= 30;
  text("Payments received", left, y, 11, bold, NAVY);
  y -= 26;
  const dateX = left + 10;
  const modeX = left + 150;
  y = tableHeader(page, bold, y, left, right, ["Date", "Paid by", "Amount"], [dateX, modeX]);
  if (received.length === 0) {
    y -= 20;
    text("No payments yet.", dateX, y, 10, regular, SOFT);
    y -= 12;
    rule(y);
  }
  for (const p of received) {
    y -= 20;
    text(p.paid_ist.slice(0, 11).replace(/^0/, ""), dateX, y, 10);
    // Only how it was paid: notes are free text and could mention the vehicle or the trip
    text(PAYMENT_METHODS[p.method], modeX, y, 10);
    textRight(formatRupees(p.amount), right - 10, y, 10, regular, INK);
    y -= 12;
    rule(y);
  }

  // ---------- Summary ----------
  const balance = balanceOf(trip);
  const boxW = 230;
  const boxX = right - boxW;
  const rows: [string, string, PDFFont, typeof INK][] = [
    ["Total", formatRupees(trip.total_amount ?? 0), regular, INK],
    ["Paid", formatRupees(trip.received), regular, INK],
  ];
  y -= 26;
  const boxTop = y + 14;
  const boxH = 20 * rows.length + 40;
  page.drawRectangle({ x: boxX, y: boxTop - boxH, width: boxW, height: boxH, color: IVORY, borderColor: LINE, borderWidth: 1 });
  let sy = boxTop - 22;
  for (const [label, value, font, color] of rows) {
    text(label, boxX + 14, sy, 10.5, regular, SOFT);
    textRight(value, right - 14, sy, 10.5, font, color);
    sy -= 20;
  }
  page.drawLine({ start: { x: boxX + 14, y: sy + 8 }, end: { x: right - 14, y: sy + 8 }, thickness: 1, color: LINE });
  sy -= 10;
  if (balance > 0) {
    text("Balance to pay", boxX + 14, sy, 11.5, bold, NAVY);
    textRight(formatRupees(balance), right - 14, sy, 13, bold, RED);
  } else {
    text("Fully paid", boxX + 14, sy, 11.5, bold, GREEN);
    textRight(formatRupees(0), right - 14, sy, 13, bold, GREEN);
  }

  // ---------- Footer ----------
  text("Thank you!", left, boxTop - 22, 12, bold, NAVY);
  text(`For any questions, call or WhatsApp ${BUSINESS.phoneDisplay}.`, left, boxTop - 40, 9.5, regular, SOFT);
  rule(PAGE.margin + 18);
  text(`${PRINT_SHOP.name}  ·  Generated on ${generatedAt}`, left, PAGE.margin + 4, 8, regular, SOFT);

  return pdf.save();
}

/** A table's header band; returns the y below it. Columns after the first two are right-aligned at the edge. */
function tableHeader(page: PDFPage, bold: PDFFont, y: number, left: number, right: number, labels: string[], xs: number[] = [left + 10]): number {
  page.drawRectangle({ x: left, y: y - 8, width: right - left, height: 22, color: IVORY });
  labels.forEach((label, i) => {
    const s = label.toUpperCase();
    const isLast = i === labels.length - 1;
    const x = isLast ? right - 10 - bold.widthOfTextAtSize(s, 8) : (xs[i] ?? left + 10);
    page.drawText(s, { x, y, size: 8, font: bold, color: SOFT });
  });
  return y - 8;
}
