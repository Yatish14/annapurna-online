import { rmSync } from "node:fs";

/**
 * The throwaway database (and the fake models) of the tests that need no browser (drafts.spec.ts, chats.spec.ts…): PGlite in
 * .data/pglite-unit, never the browser tests' database, Docker or Neon. Import this first in such a test file.
 *
 * Shared, not one per file: Playwright runs every test file in the same Node process, and lib/db.ts keeps one
 * connection per process, so a second file pointing at another folder would quietly get the first one's. It's
 * wiped once when the tests start; each file adds its own rows and counts changes, never assuming empty tables.
 */
export const UNIT_DB = "./.data/pglite-unit";
rmSync(UNIT_DB, { recursive: true, force: true });
process.env.DATABASE_URL = `pglite:${UNIT_DB}`; // before the first query: lib/db.ts connects on first use
// And the fake models (lib/assistant/fake.ts): a no-browser test that runs the graph or writes a title must never
// call Google. Set before lib/assistant/model.ts loads, which reads it once.
process.env.ASSISTANT_FAKE = "1";
