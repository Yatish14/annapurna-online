// Demo mode (10.3): the whole app on sample data, in its own database folder, ready to show or record.
//
//   npm run demo                the assistant answers with Gemini (GOOGLE_API_KEY in .env.local), privacy-first mode on
//   npm run demo -- --fake      the fake models instead: no key needed, nothing is sent to Google
//   npm run demo -- --open      privacy-first mode off (the model reads the sample data, as while building)
//   npm run demo -- --fresh     start the demo data again (otherwise it's kept between runs)
//
// Uses PGlite in .data/pglite-demo (never Docker or Neon), its own build folder and port 3200, so `npm run dev` can
// keep running. Sample data only: made-up customers, drivers and bookings (scripts/seed*.mjs).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const args = process.argv.slice(2);
const fake = args.includes("--fake");
const DIR = "./.data/pglite-demo";
const PORT = 3200;

const env = {
  ...process.env,
  DATABASE_URL: `pglite:${DIR}`,
  NEXT_DIST_DIR: ".next-demo",
  ...(args.includes("--open") ? { ASSISTANT_PRIVACY: "" } : { ASSISTANT_PRIVACY: "strict" }),
  ...(fake && { ASSISTANT_FAKE: "1" }),
};
if (!fake && !process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing from .env.local. Add it, or run: npm run demo -- --fake");
  process.exit(1);
}
const node = (script, extra = []) => execFileSync(process.execPath, [...extra, script], { stdio: "inherit", env });

if (args.includes("--fresh")) rmSync(DIR, { recursive: true, force: true });
if (!existsSync(DIR)) {
  console.log("Setting up the demo database (sample data only)…\n");
  // Tables, three sign-ins and the sample data: the same as npm run db:fresh, on the demo folder
  node("scripts/db-fresh.mjs");
  // The help guides, with Gemini's embeddings (or the fake ones with --fake)
  node("scripts/kb-ingest.ts", ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import", "./scripts/ts-paths.mjs"]);
}

console.log(`\nDemo: http://localhost:${PORT}/admin/assistant  (privacy-first mode ${env.ASSISTANT_PRIVACY === "strict" ? "on" : "off"}, ${fake ? "fake models" : "Gemini"})`);
console.log("Sign in with the sample sign-ins printed when the demo database was made (npm run demo -- --fresh shows them again).\n");
// One command string with shell: on Windows, npx is a .cmd file
spawn(`npx next dev --port ${PORT}`, { stdio: "inherit", env, shell: true }).on("exit", (code) => process.exit(code ?? 0));
