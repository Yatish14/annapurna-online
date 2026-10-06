/** Remembers whether the desktop sidebar is collapsed ("collapsed" | "expanded") */
export const SIDEBAR_COOKIE = "ad_sidebar";

/** Remembers which sidebar modules are open, e.g. "print-cars" ("none" when all are closed) */
export const MODULES_COOKIE = "ap_modules";

export const MODULE_IDS = ["print", "cars"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** Printout is open the first time; after that the sidebar remembers */
export function parseOpenModules(value: string | undefined): ModuleId[] {
  if (value === undefined) return ["print"];
  return MODULE_IDS.filter((id) => value.split("-").includes(id));
}
