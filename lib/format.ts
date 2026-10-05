/**
 * Indian numbers as 10 digits without the country code: "919876543210" or "9876543210" → "98765 43210".
 * Other countries keep their code: "447700900123" → "+447700900123".
 */
export function formatPhone(p: string): string {
  const local = p.length === 12 && p.startsWith("91") ? p.slice(2) : p;
  return local.length === 10 ? `${local.slice(0, 5)} ${local.slice(5)}` : `+${p}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}
