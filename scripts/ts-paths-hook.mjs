// The resolve hook for scripts/ts-paths.mjs (Node runs hooks in their own thread, so it's a file of its own)
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const TRY = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** The file a path without its extension means, if there is one */
function withExtension(url) {
  const file = fileURLToPath(url);
  if (existsSync(file) && statSync(file).isFile()) return url.href;
  for (const end of TRY) if (existsSync(file + end)) return pathToFileURL(file + end).href;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const url = withExtension(new URL(specifier.slice(2), ROOT));
    if (url) return { url, shortCircuit: true };
  }
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && context.parentURL?.startsWith("file:") && !context.parentURL.includes("/node_modules/")) {
    const url = withExtension(new URL(specifier, context.parentURL));
    if (url) return { url, shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (err) {
    // Packages without an "exports" map, like next ("next/headers" is next/headers.js), need the .js a bundler adds
    if (err?.code === "ERR_MODULE_NOT_FOUND" && !specifier.endsWith(".js")) return next(`${specifier}.js`, context);
    throw err;
  }
}
