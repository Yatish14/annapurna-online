import QRCode from "qrcode";
import { LOTUS_GRADIENT, LOTUS_SHAPES } from "@/components/admin/lotusShapes";

/**
 * The counter QR code as an SVG string, with the lotus logo in the middle.
 * Uses the highest error correction (H, ~30% can be covered), and the logo covers only ~6% of it,
 * so phones still read it reliably.
 */
export function qrSvg(text: string, { color = "#0a1838", pixelSize = 512 } = {}): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = modules.size;
  const quiet = 4;
  const total = n + quiet * 2;

  // Logo box in the middle: an odd number of modules wide so it sits exactly in the centre
  let logo = Math.round(n * 0.25);
  if (logo % 2 === 0) logo += 1;
  const logoStart = (n - logo) / 2;
  const inLogo = (r: number, c: number) =>
    r >= logoStart && r < logoStart + logo && c >= logoStart && c < logoStart + logo;

  // The three corner squares are drawn as rounded shapes instead of single modules
  const finders = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ];
  const inFinder = (r: number, c: number) => finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules.get(r, c) && !inFinder(r, c) && !inLogo(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }

  const finderShapes = finders
    .map(([r, c]) => {
      const x = c + quiet;
      const y = r + quiet;
      return (
        `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.6" fill="none" stroke="${color}" stroke-width="1"/>` +
        `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".8" fill="${color}"/>`
      );
    })
    .join("");

  // Logo: navy tile with a thin gold ring, gold lotus inside (sizes in modules)
  const box = logo;
  const bx = logoStart + quiet;
  const inset = 0.6;
  const lotusSize = box - inset * 2 - 1.2;
  const scale = lotusSize / 48;
  const lotusX = bx + (box - lotusSize) / 2;
  const lotusY = bx + (box - lotusSize) / 2 - 0.15;
  const stops = LOTUS_GRADIENT.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join("");
  const lotus = LOTUS_SHAPES.map((s) =>
    s.line
      ? `<path d="${s.d}" fill="none" stroke="url(#qr-lotus)" stroke-width="1.6" stroke-linecap="round"/>`
      : `<path d="${s.d}" fill="url(#qr-lotus)"${s.opacity ? ` opacity="${s.opacity}"` : ""}/>`,
  ).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges" role="img" aria-label="QR code: ${text}">` +
    `<defs><linearGradient id="qr-lotus" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path d="${d}" fill="${color}"/>` +
    `<g shape-rendering="geometricPrecision">${finderShapes}` +
    `<rect x="${bx + inset / 2}" y="${bx + inset / 2}" width="${box - inset}" height="${box - inset}" rx="1.8" fill="#fff" stroke="#c9a24a" stroke-width=".35"/>` +
    `<rect x="${bx + inset + 0.3}" y="${bx + inset + 0.3}" width="${box - inset * 2 - 0.6}" height="${box - inset * 2 - 0.6}" rx="1.3" fill="${color}"/>` +
    `<g transform="translate(${lotusX} ${lotusY}) scale(${scale})">${lotus}</g></g>` +
    `</svg>`
  );
}
