export type CsvValue = string | number | boolean | null | undefined;

/**
 * One cell. Text that a spreadsheet would run as a formula (starting with = + - @) gets a leading
 * apostrophe, so a customer name like "=HYPERLINK(…)" stays plain text. Numbers stay numbers.
 */
function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A CSV file that Excel and Google Sheets open correctly: UTF-8 with a byte-order mark (so ₹ and
 * Telugu names show properly) and Windows line endings.
 */
export function toCsv(rows: CsvValue[][]): string {
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
