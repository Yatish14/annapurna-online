// Printout rules shared by the customer's upload page and the server. No server-only imports here.

export const PRINT_SHOP = {
  name: "Annapurna Graphics and Internet",
  /** Where the counter QR code points (set SITE_URL when the site moves to its own domain) */
  siteUrl: (process.env.SITE_URL || "https://annapurna-online.vercel.app").replace(/\/+$/, ""),
  /** Uploaded files are deleted from storage this long after upload */
  keepDays: 3,
};

export const PRINT_LIMITS = {
  maxFiles: 10,
  maxFileMB: 25,
};

/**
 * How the dashboard prints a file:
 * pdf / image / text open the browser's print dialog directly;
 * download saves it so it can be opened in Word, Excel, PowerPoint or a photo app and printed from there.
 */
export type PrintMode = "pdf" | "image" | "text" | "download";

type FileType = { mime: string; label: string; mode: PrintMode; image?: true };

// Accepted documents and images, by extension. Anything else (ZIP and other archives, programs,
// web pages, SVG) is refused.
export const FILE_TYPES: Record<string, FileType> = {
  pdf: { mime: "application/pdf", label: "PDF", mode: "pdf" },
  doc: { mime: "application/msword", label: "Word", mode: "download" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word", mode: "download" },
  odt: { mime: "application/vnd.oasis.opendocument.text", label: "Document", mode: "download" },
  rtf: { mime: "application/rtf", label: "Document", mode: "download" },
  txt: { mime: "text/plain", label: "Text", mode: "text" },
  xls: { mime: "application/vnd.ms-excel", label: "Excel", mode: "download" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel", mode: "download" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", label: "Spreadsheet", mode: "download" },
  csv: { mime: "text/csv", label: "CSV", mode: "text" },
  ppt: { mime: "application/vnd.ms-powerpoint", label: "PowerPoint", mode: "download" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint", mode: "download" },
  odp: { mime: "application/vnd.oasis.opendocument.presentation", label: "Presentation", mode: "download" },
  jpg: { mime: "image/jpeg", label: "Photo", mode: "image", image: true },
  jpeg: { mime: "image/jpeg", label: "Photo", mode: "image", image: true },
  png: { mime: "image/png", label: "Image", mode: "image", image: true },
  gif: { mime: "image/gif", label: "Image", mode: "image", image: true },
  webp: { mime: "image/webp", label: "Image", mode: "image", image: true },
  bmp: { mime: "image/bmp", label: "Image", mode: "image", image: true },
  // iPhone photos and scans: browsers can't print these directly, so they are downloaded
  heic: { mime: "image/heic", label: "Photo", mode: "download", image: true },
  heif: { mime: "image/heif", label: "Photo", mode: "download", image: true },
  tif: { mime: "image/tiff", label: "Image", mode: "download", image: true },
  tiff: { mime: "image/tiff", label: "Image", mode: "download", image: true },
};

const ARCHIVES = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zipx", "cab", "iso"]);

/** For the file picker's accept attribute */
export const ACCEPT = Object.keys(FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export type FileCheck = { ok: true; ext: string; type: FileType } | { ok: false; error: string };

/** Is this file accepted? Checks the name's extension and the size. */
export function checkFile(name: string, size: number): FileCheck {
  const ext = extensionOf(name);
  if (ARCHIVES.has(ext)) return { ok: false, error: `${name}: ZIP and other compressed files aren't accepted. Please upload the files inside it.` };
  const type = FILE_TYPES[ext];
  if (!type) return { ok: false, error: `${name}: this type of file can't be printed here. Upload PDF, Word, Excel, PowerPoint, text or photo files.` };
  if (size <= 0) return { ok: false, error: `${name} is empty.` };
  if (size > PRINT_LIMITS.maxFileMB * 1024 * 1024) return { ok: false, error: `${name} is larger than ${PRINT_LIMITS.maxFileMB} MB.` };
  return { ok: true, ext, type };
}

export function fileTypeOf(name: string): FileType | undefined {
  return FILE_TYPES[extensionOf(name)];
}

// ---------- Print options ----------

export type ColorMode = "bw" | "color";
export type Sides = "single" | "double";

export type PrintOptions = {
  color: ColorMode;
  sides: Sides;
  copies: number;
  /** "" = all pages. Ignored for images. */
  pages: string;
};

export const DEFAULT_OPTIONS: PrintOptions = { color: "bw", sides: "single", copies: 1, pages: "" };

export const COLOR_LABELS: Record<ColorMode, string> = { bw: "Black & white", color: "Colour" };
export const SIDES_LABELS: Record<Sides, string> = { single: "Single-sided", double: "Double-sided" };

/**
 * "1-3,5" / "1 – 3, 5" → "1-3, 5". Returns null when the text isn't a valid list of pages.
 * An empty string means all pages and is returned as "".
 */
export function normalizePageRange(input: string): string | null {
  const text = input.replace(/[–—]/g, "-").replace(/\s+/g, "");
  if (!text) return "";
  if (text.length > 60) return null;
  const parts: string[] = [];
  for (const part of text.split(",")) {
    const m = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to < from) return null;
    parts.push(from === to ? String(from) : `${from}-${to}`);
  }
  return parts.join(", ");
}

export function copiesText(copies: number): string {
  return `${copies} ${copies === 1 ? "copy" : "copies"}`;
}

/** "Black & white · Double-sided · Pages 1-3 · 2 copies" */
export function optionsText(o: { color: ColorMode; sides: Sides; copies: number; page_range?: string | null; pages?: string }): string {
  const pages = o.page_range ?? o.pages;
  return [COLOR_LABELS[o.color], SIDES_LABELS[o.sides], pages ? `Pages ${pages}` : null, copiesText(o.copies)]
    .filter(Boolean)
    .join(" · ");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
