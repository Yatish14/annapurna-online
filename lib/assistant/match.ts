import { isState, loadCities } from "@/lib/expenses/places";
import { formatPhone } from "@/lib/format";

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
 * The item a name means. An exact name wins ("Kia Carens"); otherwise every item that fits all the words: each word
 * starts a word of its name ("innova" → "Innova Crysta", "ramesh" → "Ramesh Naidu"), or, for drivers, is 4 or more
 * digits of their phone ("98490", or "Ravi Kumar (98480 22338)" when two drivers are both called Ravi Kumar).
 */
export function matchName<T extends { name: string; phone?: string }>(text: string, items: T[]): Match<T> {
  const q = words(text);
  if (!q) return { found: null, candidates: [] };
  const exact = items.filter((i) => words(i.name) === q);
  if (exact.length === 1) return { found: exact[0] };
  const parts = q.split(" ");
  const fits = (i: T) => {
    const name = words(i.name).split(" ");
    return parts.every((p) => name.some((w) => w.startsWith(p)) || (/^\d{4,}$/.test(p) && !!i.phone?.includes(p)));
  };
  const matches = items.filter(fits);
  return matches.length === 1 ? { found: matches[0] } : { found: null, candidates: matches };
}

/**
 * Names to show the admin as choices, told apart: a driver's phone is added only when another choice has the same
 * name ("Ravi Kumar (98480 22338)", "Ravi Kumar (99123 45678)"), so phones aren't shown when they aren't needed.
 */
export function choiceNames<T extends { name: string; phone?: string }>(items: T[]): string[] {
  return items.map((i) => nameAmong(i, items));
}

/** One item's name, with the phone added if another of `items` has the same name (for the ready draft, too) */
export function nameAmong<T extends { name: string; phone?: string }>(item: T, items: T[]): string {
  const twin = items.some((o) => o !== item && words(o.name) === words(item.name));
  return twin && item.phone ? `${item.name} (${formatPhone(item.phone)})` : item.name;
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
