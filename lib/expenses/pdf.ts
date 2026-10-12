import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { rgb, type PDFDocument, type PDFFont } from "pdf-lib";

/** What the Expense Tracker's PDFs (customer statements, monthly reports) share: colours, fonts, text fitting */

// Noto Sans (SIL Open Font License, assets/fonts/OFL.txt): has the ₹ sign, which the built-in PDF fonts don't
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

export const NAVY = rgb(0.04, 0.09, 0.22);
export const INK = rgb(0.16, 0.19, 0.27);
export const SOFT = rgb(0.42, 0.45, 0.53);
export const GOLD = rgb(0.69, 0.54, 0.2);
export const LINE = rgb(0.88, 0.86, 0.81);
export const IVORY = rgb(0.98, 0.96, 0.92);
export const RED = rgb(0.71, 0.14, 0.09);
export const GREEN = rgb(0.06, 0.42, 0.31);
export const PLUM = rgb(0.42, 0.2, 0.42);

export async function embedFonts(pdf: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(FONT_DIR, "NotoSans-Regular.ttf")),
    readFile(path.join(FONT_DIR, "NotoSans-Bold.ttf")),
  ]);
  return { regular: await pdf.embedFont(regularBytes), bold: await pdf.embedFont(boldBytes) };
}

/** "12 Oct 2026, 3:20 pm" in Indian time, for "Generated on…" lines */
export function generatedNow(): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date());
}

/** Cuts text that doesn't fit the width, ending with "…" */
export function fit(s: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  let cut = s;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Splits text into lines no wider than the width */
export function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
