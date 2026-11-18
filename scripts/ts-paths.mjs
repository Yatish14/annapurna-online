// Lets plain Node run the app's TypeScript (lib/…) from a script: node --import ./scripts/ts-paths.mjs file.ts
// Node 24 strips TypeScript types by itself, but it doesn't know two things Next.js does:
// - "@/lib/db" means <project>/lib/db (tsconfig.json "paths")
// - imports leave out the extension: "./result" is ./result.ts (or ./result/index.ts)
// This hook teaches it both. Used by the eval runner (evals/) and the knowledge-base scripts.
import { register } from "node:module";

register("./ts-paths-hook.mjs", import.meta.url);
