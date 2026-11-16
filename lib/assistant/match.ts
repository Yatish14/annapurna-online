import { isState, loadCities } from "@/lib/expenses/places";

/**
 * Matching what an admin says ("the Innova", "Ramesh", "Vijayawada") to the real vehicle, driver or place. Our code
 * does the matching, against the database's own lists, so the model can't pick a vehicle that doesn't exist or
 * guess a state. When the words match several, all of them come back, so the admin can be asked which (4.3).
 */

/** "The Innova!" → "innova": lower case, no "the", no punctuation, single spaces */
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|our)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type Match<T> = { found: T } | { found: null; candidates: T[] };

/**
 * The item a name means. An exact name wins ("Kia Carens"); otherwise every item whose name contains all the words
 * ("innova" → "Innova Crysta", "ramesh" → "Ramesh Naidu"). For drivers, digits also match their phone ("98490").
 */
export function matchName<T extends { name: string; phone?: string }>(text: string, items: T[]): Match<T> {
  const q = words(text);
  if (!q) return { found: null, candidates: [] };
  const exact = items.filter((i) => words(i.name) === q);
  if (exact.length === 1) return { found: exact[0] };
  const digits = text.replace(/\D/g, "");
  const parts = q.split(" ");
  const matches = items.filter(
    (i) => parts.every((p) => words(i.name).split(" ").some((w) => w.startsWith(p))) || (digits.length >= 4 && i.phone?.includes(digits)),
  );
  return matches.length === 1 ? { found: matches[0] } : { found: null, candidates: matches };
}

/**
 * Where a city is, from the booking form's own list of places: each state it's in, with the list's spelling of it
 * ("vijayawada" → [{ state: "Andhra Pradesh", city: "Vijayawada" }]). Empty if the list doesn't have it.
 */
export async function placesNamed(city: string): Promise<{ state: string; city: string }[]> {
  const q = words(city);
  const byState = await loadCities();
  return Object.entries(byState).flatMap(([state, cities]) => {
    const found = isState(state) ? cities.find((c) => words(c) === q) : undefined;
    return found ? [{ state, city: found }] : [];
  });
}
