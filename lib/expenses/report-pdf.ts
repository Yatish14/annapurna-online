import { PDFDocument, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { BUSINESS } from "../config";
import { formatNumber, formatRupees } from "./money";
import { embedFonts, fit, generatedNow, GOLD, GREEN, INK, IVORY, LINE, NAVY, PLUM, RED, SOFT, wrap } from "./pdf";
import { cellText, cellTone, monthLabel, type Cell, type Report, type Tile } from "./reports";

// A4 landscape, so the wide tables fit
const PAGE = { width: 841.89, height: 595.28, margin: 36 };
const LEFT = PAGE.margin;
const RIGHT = PAGE.width - PAGE.margin;
const WIDTH = RIGHT - LEFT;
/** Lowest a table row may go before it moves to the next page (the footer sits below) */
const BOTTOM = PAGE.margin + 30;
const ROW = 16;
const PAD = 5;

const TILE_COLORS: Record<Tile["tone"], Color> = { navy: NAVY, green: GREEN, red: RED, gold: GOLD, plum: PLUM };

/** The report as a PDF: header, summary boxes, each table (continuing over pages), notes, and page numbers */
export async function buildReportPdf(report: Report): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await embedFonts(pdf);
  const month = monthLabel(report.month);
  pdf.setTitle(`${report.title} · ${month}`);
  pdf.setAuthor(BUSINESS.name);
  pdf.setCreator(BUSINESS.name);
  const generated = generatedNow();

  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, at: number, size: number, font: PDFFont = regular, color: Color = INK) =>
    page.drawText(s, { x, y: at, size, font, color });
  const textRight = (s: string, xRight: number, at: number, size: number, font: PDFFont = regular, color: Color = INK) =>
    text(s, xRight - font.widthOfTextAtSize(s, size), at, size, font, color);
  const rule = (at: number, color: Color = LINE, thickness = 0.75) =>
    page.drawLine({ start: { x: LEFT, y: at }, end: { x: RIGHT, y: at }, thickness, color });

  /** A new page with the report's header; the first page's is bigger */
  const newPage = () => {
    const first = !page;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin - 6;
    text(BUSINESS.name, LEFT, y, first ? 17 : 11, bold, NAVY);
    textRight(report.title.toUpperCase(), RIGHT, y + (first ? 3 : 0), first ? 11 : 9, bold, GOLD);
    y -= first ? 17 : 13;
    text(`Expense Tracker  ·  ${month}`, LEFT, y, first ? 10 : 8.5, first ? bold : regular, first ? INK : SOFT);
    textRight(`Generated on ${generated}`, RIGHT, y, 8.5, regular, SOFT);
    y -= 10;
    rule(y, GOLD, first ? 1.5 : 1);
    y -= first ? 16 : 22;
  };
  newPage();

  // ---------- Summary boxes ----------
  // One row of up to 8 boxes; more go in two even rows
  const gap = 8;
  const perRow = report.tiles.length <= 8 ? report.tiles.length : Math.ceil(report.tiles.length / 2);
  const tileW = (WIDTH - gap * (perRow - 1)) / perRow;
  const tileH = 48;
  report.tiles.forEach((tile, i) => {
    if (i > 0 && i % perRow === 0) y -= tileH + gap;
    const x = LEFT + (i % perRow) * (tileW + gap);
    page.drawRectangle({ x, y: y - tileH, width: tileW, height: tileH, color: IVORY, borderColor: LINE, borderWidth: 0.75 });
    text(fit(tile.label.toUpperCase(), bold, 6.5, tileW - 16), x + 8, y - 13, 6.5, bold, SOFT);
    const value = tile.money ? formatRupees(tile.value) : formatNumber(tile.value);
    text(fit(value, bold, 12, tileW - 16), x + 8, y - 29, 12, bold, TILE_COLORS[tile.tone]);
    if (tile.sub) text(fit(tile.sub, regular, 6.5, tileW - 16), x + 8, y - 40, 6.5, regular, SOFT);
  });
  y -= tileH + 26;

  // ---------- Tables ----------
  for (const section of report.sections) {
    const weights = section.columns.reduce((acc, c) => acc + c.width, 0);
    const widths = section.columns.map((c) => (c.width / weights) * WIDTH);
    const xs = widths.map((_, i) => LEFT + widths.slice(0, i).reduce((a, w) => a + w, 0));

    const drawCells = (cells: Cell[], font: PDFFont, size: number, colorOf: (i: number) => Color) =>
      section.columns.forEach((column, i) => {
        const s = fit(cellText(cells[i] ?? null, column), font, size, widths[i] - PAD * 2);
        if (column.kind === "text") text(s, xs[i] + PAD, y, size, font, colorOf(i));
        else textRight(s, xs[i] + widths[i] - PAD, y, size, font, colorOf(i));
      });
    const head = (continued: boolean) => {
      text(continued ? `${section.title} (continued)` : section.title, LEFT, y, 11, bold, NAVY);
      y -= 20;
      page.drawRectangle({ x: LEFT, y: y - 6, width: WIDTH, height: 19, color: IVORY });
      section.columns.forEach((column, i) => {
        const s = fit(column.label.toUpperCase(), bold, 6.5, widths[i] - PAD * 2);
        if (column.kind === "text") text(s, xs[i] + PAD, y, 6.5, bold, SOFT);
        else textRight(s, xs[i] + widths[i] - PAD, y, 6.5, bold, SOFT);
      });
      y -= 6;
    };
    /** Room for the next line, else a new page that repeats the table's heading */
    const room = (needed: number) => {
      if (y - needed >= BOTTOM) return;
      newPage();
      head(true);
    };

    // Keep the title with its heading and first row
    if (y - (20 + 6 + ROW * 2) < BOTTOM) newPage();
    head(false);

    if (section.rows.length === 0) {
      y -= ROW;
      text(section.empty, LEFT + PAD, y, 8.5, regular, SOFT);
      y -= 6;
      rule(y);
    }
    for (const row of section.rows) {
      room(ROW);
      y -= ROW - 5;
      drawCells(row.cells, regular, 8, (i) => {
        const tone = cellTone(row.cells[i] ?? null, section.columns[i]);
        return tone === "neg" ? RED : tone === "pos" ? GREEN : i === 0 ? NAVY : INK;
      });
      y -= 5;
      rule(y);
    }
    if (section.total && section.rows.length > 0) {
      room(ROW + 4);
      y -= ROW - 4;
      const total = section.total;
      drawCells(total, bold, 8, (i) => {
        const tone = cellTone(total[i] ?? null, section.columns[i]);
        return tone === "neg" ? RED : tone === "pos" ? GREEN : NAVY;
      });
      y -= 6;
      rule(y, NAVY, 1);
    }
    y -= 28;
  }

  // ---------- Notes ----------
  const lines = report.notes.flatMap((n) => wrap(n, regular, 8, WIDTH));
  if (y - 14 * lines.length < BOTTOM) newPage();
  for (const line of lines) {
    text(line, LEFT, y, 8, regular, SOFT);
    y -= 12;
  }

  // ---------- Footer on every page ----------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    page = p;
    rule(PAGE.margin + 14);
    text(`${BUSINESS.name}  ·  ${report.title}  ·  ${month}`, LEFT, PAGE.margin, 7.5, regular, SOFT);
    textRight(`Page ${i + 1} of ${pages.length}`, RIGHT, PAGE.margin, 7.5, regular, SOFT);
  });

  return pdf.save();
}
