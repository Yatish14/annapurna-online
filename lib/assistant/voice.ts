/**
 * The languages the mic listens for (Step 7). Shared by the chat box (components/assistant/Composer.tsx), which
 * tells the browser's speech recognition which language to expect, and the API route, which tells the model which
 * language the admin spoke (7.7). No server-only code here: the browser imports it.
 */
export const LANGUAGES = [
  { code: "en-IN", short: "EN", label: "English", english: "English (India)", name: "English" },
  { code: "te-IN", short: "TE", label: "తెలుగు", english: "Telugu", name: "Telugu" },
  { code: "hi-IN", short: "HI", label: "हिन्दी", english: "Hindi", name: "Hindi" },
] as const;

export type SpokenLanguage = (typeof LANGUAGES)[number]["code"];

/** Only our three codes: the language comes from the browser, so the route checks it before it reaches the prompt */
export function isSpokenLanguage(value: unknown): value is SpokenLanguage {
  return LANGUAGES.some((l) => l.code === value);
}

/** "te-IN" → "Telugu" */
export function languageName(code: SpokenLanguage): string {
  return LANGUAGES.find((l) => l.code === code)!.name;
}
