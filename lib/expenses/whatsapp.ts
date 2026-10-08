import { fmtRange } from "../dates";
import { PRINT_SHOP } from "../print/files";
import { formatRupees } from "./money";
import { balanceOf, type Trip } from "./trips";

/**
 * The WhatsApp message to the customer about what they still have to pay (kept to expenses and amounts:
 * no mention of travels or car hire). Fully paid: a thank-you; no total yet: just a hello.
 */
export function customerMessage(t: Pick<Trip, "customer_name" | "start_date" | "end_date" | "total_amount" | "received">): string {
  const hello = [`Namaste ${t.customer_name},`, `This is ${PRINT_SHOP.name}.`];
  if (t.total_amount === null) return hello.join("\n");
  const balance = balanceOf(t);
  const lines = [`Expenses for ${fmtRange(t.start_date, t.end_date)}:`, `Total: ${formatRupees(t.total_amount)}`];
  if (balance > 0) {
    lines.push(`Paid: ${formatRupees(t.received)}`, `Balance to pay: ${formatRupees(balance)}`, "", "Please pay the balance at your convenience. Thank you!");
  } else {
    lines.push("Fully paid. Thank you!");
  }
  return [...hello, "", ...lines].join("\n");
}

/** Opens a WhatsApp chat with the customer with the message ready to send */
export function customerWhatsAppLink(t: Parameters<typeof customerMessage>[0] & Pick<Trip, "customer_phone">): string {
  return `https://wa.me/91${t.customer_phone}?text=${encodeURIComponent(customerMessage(t))}`;
}
