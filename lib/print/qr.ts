import QRCode from "qrcode";

/**
 * The counter QR code as an SVG string: a plain, standard code (square corners, no logo, error correction M,
 * a 4-square white margin). Kept plain on purpose: a logo needs the highest error correction, which makes the
 * code denser and harder to read for old or cheap phone cameras.
 */
export function qrSvg(text: string, { color = "#0a1838", pixelSize = 512 } = {}): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const quiet = 4;
  const total = n + quiet * 2;

  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules.get(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges" role="img" aria-label="QR code: ${text}">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path d="${d}" fill="${color}"/>` +
    `</svg>`
  );
}
