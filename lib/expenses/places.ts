/**
 * Indian states and union territories, for the Expense Tracker's pickup, drop, destination and repair-shop fields.
 * The cities of each state are in india-places.json (built by scripts/india-places.mjs) and are only
 * loaded in the browser when a form needs them. A city that isn't in the list can be typed in.
 */
export const STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export type IndianState = (typeof STATES)[number];

export function isState(value: unknown): value is IndianState {
  return typeof value === "string" && (STATES as readonly string[]).includes(value);
}

export const CITY_MAX = 60;

/** A typed city or place name, tidied ("  vijayawada " → "vijayawada"); null when empty or too long */
export function cleanPlace(value: unknown): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length >= 2 && text.length <= CITY_MAX ? text : null;
}

let cities: Promise<Record<string, string[]>> | undefined;

/** All cities by state (about 50 KB, loaded once, only when asked for) */
export function loadCities(): Promise<Record<string, string[]>> {
  cities ??= import("./india-places.json").then((m) => m.default as Record<string, string[]>);
  return cities;
}

/** "Vijayawada, Andhra Pradesh" */
export function placeText(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(", ");
}
