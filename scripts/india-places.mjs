// Builds lib/expenses/india-places.json (states and their cities) for the Expense Tracker forms.
// Only needed again to refresh the list: node scripts/india-places.mjs
//
// Source: countries-states-cities-database by Darshan Gada (https://github.com/dr5hn/countries-states-cities-database),
// licensed under the Open Database License (ODbL v1.0). The generated file is a derived database under the same licence.
import { writeFileSync } from "node:fs";

const SOURCE = "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries%2Bstates%2Bcities.json";

// Common names missing from the source (the source has older spellings such as "Cuddapah")
const EXTRA = {
  "Andhra Pradesh": ["Kadapa", "Rajamahendravaram"],
  Telangana: ["Hanamkonda"],
};

const titleCase = (s) => s.replace(/(^|[\s(-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());

console.log("Downloading the source list (about 45 MB)…");
const countries = await (await fetch(SOURCE)).json();
const india = countries.find((c) => c.iso2 === "IN");

const out = {};
for (const state of [...india.states].sort((a, b) => a.name.localeCompare(b.name))) {
  const seen = new Map();
  for (const raw of [...state.cities.map((c) => c.name), ...(EXTRA[state.name] ?? [])]) {
    // Joined-up names ("GovindapuramChilakaluripetGuntur") are data errors
    if (/[a-z][A-Z]/.test(raw)) continue;
    const name = titleCase(raw.replace(/\s+(District|Division)$/i, "").replace(/\s+/g, " ").trim());
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  out[state.name] = [...seen.values()].sort((a, b) => a.localeCompare(b));
}

writeFileSync(new URL("../lib/expenses/india-places.json", import.meta.url), JSON.stringify(out));
const total = Object.values(out).reduce((n, list) => n + list.length, 0);
console.log(`✓ ${Object.keys(out).length} states and union territories, ${total} cities and towns`);
