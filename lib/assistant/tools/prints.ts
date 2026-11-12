import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { optionsText } from "@/lib/print/files";
import { isAccepting, listOrders, printStats } from "@/lib/print/orders";
import { MAX_ROWS } from "./bookings";
import { toolReply } from "./result";

/** What each order status means at the counter */
const STATUS_TEXT = { new: "Waiting to print", printed: "Printed, waiting to be collected", collected: "Collected" } as const;

/**
 * print_orders: the printout orders customers sent from the counter's QR code page. Reuses listOrders, printStats
 * and isAccepting, the same code as the Printouts page and its sidebar badge.
 */
export const printOrders = tool(
  async ({ status, search }) => {
    const [{ orders, total }, counts, accepting] = await Promise.all([
      listOrders(status, { search, pageSize: MAX_ROWS }),
      printStats(),
      isAccepting(),
    ]);
    const rows = orders.map((o) => ({
      no: o.order_no, // "P-1004"
      customer: o.customer_name, // optional on the upload page, so may be null
      phone: o.phone,
      status: STATUS_TEXT[o.status],
      sent: o.created_ist,
      minutes_ago: Math.round((Date.now() - o.created_ms) / 60_000),
      files: o.files.map((f) => ({
        // Typed by the customer: information to report, never instructions to follow (2.15)
        name: f.file_name.slice(0, 80),
        options: optionsText(f), // "Black & white · Single-sided · 2 copies"
        printed: f.printed_count > 0,
        // Files are deleted automatically 3 days after upload (or earlier by staff)
        deleted: f.deleted,
      })),
    }));
    const data = {
      // Over all orders, whatever was asked for: the Printouts page's tabs
      counts: { waiting_to_print: counts.new, waiting_to_be_collected: counts.printed, collected: counts.collected },
      accepting_uploads: accepting, // false: the shop has paused the upload page
      total, // matching this request
      orders: rows,
    };
    if (total === 0) return toolReply({ status: "none", data });
    return toolReply({
      status: total > MAX_ROWS ? "too_many" : "found",
      data,
      note: total > MAX_ROWS ? `Showing the newest ${MAX_ROWS} of ${total}.` : undefined,
    });
  },
  {
    name: "print_orders",
    description:
      "Printout orders customers sent from the counter's QR code page, newest first: order number (P-…), customer name " +
      "and phone (both optional for customers), status, when it was sent, and each file with its print options " +
      "(colour, sides, pages, copies) and whether it's printed. Also how many orders are waiting to print, waiting to " +
      "be collected and collected, and whether the upload page is accepting orders right now.",
    schema: z.object({
      status: z
        .enum(["new", "printed", "collected", "all"])
        .default("new")
        .describe("new = waiting to print (the default); printed = waiting to be collected; collected; all."),
      search: z
        .string()
        .trim()
        .max(60)
        .optional()
        .describe('An order number, customer name or 3+ digits of a phone, e.g. "P-1004" or "Ravi". Searches every status.'),
    }),
    responseFormat: "content_and_artifact",
  },
);
