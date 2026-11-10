import { ChatGoogle } from "@langchain/google/node";

/**
 * Which AI model Annapurna Assist uses, and its settings, in one place. Server only: it reads
 * GOOGLE_API_KEY, which is never sent to the browser. Switching models (or later to a paid one)
 * only changes this file.
 */

/** Gemini models on Google's free tier (limits: docs/assistant-plan.md → Cost) */
export const MODELS = {
  /** Everyday: 15 requests a minute, 500 a day */
  flashLite: "gemini-3.5-flash-lite",
  /** Smarter, for checking answer quality: 5 a minute, only 20 a day */
  flash: "gemini-3.8-flash",
} as const;

/** The model that answers. ASSISTANT_MODEL=gemini-3.8-flash in .env.local switches it without changing code. */
export const MAIN_MODEL = process.env.ASSISTANT_MODEL || MODELS.flashLite;

/** The model that answers the admin's questions */
export function mainModel() {
  return new ChatGoogle({
    model: MAIN_MODEL,
    temperature: 0.2, // low: the same question gets nearly the same answer
    maxOutputTokens: 1024, // a cap on one answer's length (about 700 words)
    maxRetries: 1, // over the free limit, say "try again later" quickly instead of retrying and using up more
  });
}
