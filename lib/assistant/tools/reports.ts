import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { todayIST } from "@/lib/dates";
import { buildReports, monthLabel, pdfName, REPORT_VIEWS, viewTitle } from "@/lib/expenses/reports";
import { toolReply } from "./result";

/**
 * report: a month's report from the Expense Tracker's Reports page (bookings, customers, drivers, vehicles, or all
 * four), with its headline numbers and the link to download it as a PDF. Reuses buildReports, the same code as the
 * Reports page and its PDF, so the numbers here are the ones in the file.
 *
 * Only each report's tiles (its headline numbers) go to the model, not every table row: enough to answer "how did
 * October go?", small enough to stay quick. The full tables are in the PDF.
 */
export const report = tool(
  async ({ which, month }) => {
    const m = month ?? todayIST().slice(0, 7);
    const reports = await buildReports(which, m);
    const data = {
      title: `${viewTitle(which)} · ${monthLabel(m)}`, // "Drivers report · October 2026"
      reports: reports.map((r) => ({
        report: r.title,
        lists: r.contents, // "6 bookings, 9 vehicle costs"
        // Each tile: its label, its value (rupees or a count), and its small print ("₹23,293 once fully paid")
        numbers: r.tiles.map((t) => ({ [t.label]: t.value, ...(t.sub && { note: t.sub }) })),
      })),
      // The same links as the Reports page's tab and its "Download PDF" button (3.2 shows them as a file card)
      pdf: { file: pdfName(which, m), url: `/admin/expenses/reports/pdf?month=${m}&tab=${which}` },
      page: `/admin/expenses/reports?tab=${which}&month=${m}`,
    };
    const empty = reports.every((r) => r.sections.every((s) => s.rows.length === 0));
    return toolReply({ status: empty ? "none" : "found", data, note: empty ? `Nothing recorded for ${monthLabel(m)}.` : undefined });
  },
  {
    name: "report",
    description:
      "A month's report from the Reports page, with its headline numbers and a PDF to download: bookings (billed, " +
      "received, balance due, driver pay, fuel, other expenses, profit), customers (who paid and who owes), drivers " +
      "(pay agreed, paid, still to pay), vehicles (each vehicle's costs and profit), or all four. Use it when the " +
      "admin asks for a report or a PDF, and for any 'profit' question about a month: its Bookings profit and Total " +
      "profit (after every cost) are the Reports page's, counting the bookings that start in the month. (For cash in " +
      "and out during the month, use month_overview.)",
    schema: z.object({
      which: z
        .enum(REPORT_VIEWS)
        .default("all")
        .describe("bookings, customers, drivers, vehicles, or all (all four in one file, the default)."),
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "A month like 2026-10")
        .optional()
        .describe("The month as YYYY-MM (2026-10 is October 2026). Leave out for this month."),
    }),
    responseFormat: "content_and_artifact",
  },
);
