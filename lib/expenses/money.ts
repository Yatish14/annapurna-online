/** Money helpers for the Expense Tracker (used on the server and in the browser) */

/** Largest amount accepted in any money field: ₹1 crore */
export const AMOUNT_MAX = 10_000_000;

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** 125000 → "₹1,25,000", 99.5 → "₹99.50" */
export function formatRupees(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  const text = Number.isInteger(abs) ? rupees.format(abs) : abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}₹${text}`;
}

/** 45120 → "45,120" */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-IN");
}

/**
 * A money field from a form: null when empty, a number rounded to paise, or "invalid"
 * (negative, not a number, more than 2 decimals' worth of nonsense, or above ₹1 crore).
 * Commas and a leading ₹ are allowed: "₹1,25,000" → 125000.
 */
export function parseAmount(raw: unknown, { allowZero = true } = {}): number | null | "invalid" {
  const text = String(raw ?? "").replace(/[₹,\s]/g, "");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "invalid";
  const n = Math.round(Number(text) * 100) / 100;
  if (n > AMOUNT_MAX || (!allowZero && n === 0)) return "invalid";
  return n;
}

/** Whole-number reading such as an odometer; null when empty, "invalid" otherwise wrong */
export function parseWhole(raw: unknown, max = 9_999_999): number | null | "invalid" {
  const text = String(raw ?? "").replace(/[,\s]/g, "");
  if (!text) return null;
  if (!/^\d+$/.test(text)) return "invalid";
  const n = Number(text);
  return n <= max ? n : "invalid";
}

export const PAYMENT_METHODS = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  other: "Other",
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && value in PAYMENT_METHODS;
}
