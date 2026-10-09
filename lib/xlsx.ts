import { crc32, deflateRawSync } from "node:zlib";
import type { CsvValue } from "./csv";

/** How a row looks: a big title, a section heading, a column header (shaded), a total, or plain */
export type RowStyle = "title" | "heading" | "header" | "total" | "plain";

export type Sheet = {
  /** The tab name (Excel allows 31 characters, without : \ / ? * [ ]) */
  name: string;
  rows: CsvValue[][];
  rowStyle?: (row: CsvValue[], index: number) => RowStyle;
};

const STYLES: RowStyle[] = ["plain", "title", "heading", "header", "total"];
const NUMBER_FORMATS = [0, 3, 4]; // text/general, whole numbers "1,234", decimals "1,234.50"

/** The cell style index: one per row style × number format, in the order styles.xml lists them */
const styleIndex = (row: RowStyle, value: CsvValue) => {
  const format = typeof value !== "number" ? 0 : Number.isInteger(value) ? 1 : 2;
  return STYLES.indexOf(row) * NUMBER_FORMATS.length + format;
};

function stylesXml(): string {
  // Fonts: 0 normal, 1 bold, 2 bold and larger. Fills 0 and 1 are required by Excel; 2 shades header rows.
  const font: Record<RowStyle, number> = { plain: 0, title: 2, heading: 1, header: 1, total: 1 };
  const xfs = STYLES.flatMap((row) =>
    NUMBER_FORMATS.map(
      (fmt) =>
        `<xf numFmtId="${fmt}" fontId="${font[row]}" fillId="${row === "header" ? 2 : 0}" borderId="0" xfId="0"` +
        `${fmt ? ' applyNumberFormat="1"' : ""}${font[row] ? ' applyFont="1"' : ""}${row === "header" ? ' applyFill="1"' : ""}/>`,
    ),
  );
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF6E7C1"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

/** Text safe inside XML: escaped, and without control characters Excel refuses */
const xmlText = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 0 → A, 25 → Z, 26 → AA */
function column(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const cellText = (value: CsvValue): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

/** Column widths from the table rows (lines with a single cell, like headings and notes, may run wide) */
function widths(rows: CsvValue[][]): number[] {
  const out: number[] = [];
  for (const row of rows) {
    if (row.filter((v) => cellText(v) !== null).length < 2) continue;
    row.forEach((v, i) => {
      const text = typeof v === "number" ? v.toLocaleString("en-IN") : (cellText(v) ?? "");
      out[i] = Math.max(out[i] ?? 8, Math.min(text.length + 2, 45));
    });
  }
  return out;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows.map((row, r) => {
    const style = sheet.rowStyle?.(row, r) ?? "plain";
    const cells = row.map((value, c) => {
      const ref = `${column(c)}${r + 1}`;
      const s = styleIndex(style, value);
      if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}" s="${s}"><v>${value}</v></c>` : "";
      const text = cellText(value);
      // Inline strings are never formulas, so "=…" typed into a name stays plain text
      if (text === null) return style === "header" ? `<c r="${ref}" s="${s}"/>` : "";
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;
    });
    return `<row r="${r + 1}">${cells.join("")}</row>`;
  });
  const cols = widths(sheet.rows)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData></worksheet>`
  );
}

/** A zip archive (what an .xlsx file is) of the given files, compressed */
function zip(files: { name: string; data: string }[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.data, "utf8");
    const packed = deflateRawSync(raw);
    const crc = crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); // local file header
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0x0800, 6); // names are UTF-8
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(0, 10); // time
    head.writeUInt16LE(0x21, 12); // date: 1 Jan 1980
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    local.push(head, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); // central directory entry
    entry.writeUInt16LE(20, 4); // made by
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += head.length + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, dir, end]));
}

/** An Excel workbook with one tab per sheet. Opens in Excel, Google Sheets, Numbers and LibreOffice. */
export function toXlsx(sheets: Sheet[]): Uint8Array {
  const tabs = sheets.map((s, i) => ({ ...s, name: s.name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || `Sheet ${i + 1}` }));
  const MAIN = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
  return zip([
    {
      name: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        tabs
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${MAIN}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${MAIN}"><sheets>` +
        tabs.map((s, i) => `<sheet name="${xmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}">` +
        tabs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${MAIN}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${tabs.length + 1}" Type="${MAIN}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: stylesXml() },
    ...tabs.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ]);
}
