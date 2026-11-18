import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./users";

/**
 * Step 7: asking by voice. A real mic can't be used in a test, so the browser's speech recognition is replaced
 * before the page loads (addInitScript) with a pretend one the test drives: it "hears" words (say), stops (end), or
 * fails with one of the browser's error codes. Everything else, the chat box and the mic button, is the real page.
 */

type Speech = { lang?: string; started: number };

/** Puts the pretend speech recognition in place (or removes speech recognition altogether: `supported: false`) */
async function fakeSpeech(page: Page, { supported = true, fail }: { supported?: boolean; fail?: string } = {}) {
  await page.addInitScript(
    ({ supported, fail }) => {
      const w = window as unknown as Record<string, unknown>;
      // Chrome has its own, under both names: hide them so only ours, or none, is there
      for (const name of ["webkitSpeechRecognition", "SpeechRecognition"]) {
        Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
      }
      if (!supported) return;
      const speech = { started: 0, lang: undefined as string | undefined, current: null as null | Record<string, (e?: unknown) => void> };
      w.__speech = speech;
      w.SpeechRecognition = class {
        lang = "";
        interimResults = false;
        continuous = false;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          speech.started++;
          speech.lang = this.lang;
          speech.current = this as unknown as Record<string, (e?: unknown) => void>;
          if (fail) setTimeout(() => (this.onerror?.({ error: fail }), this.onend?.()), 20);
        }
        stop() {
          this.onend?.();
        }
      };
      // What the test calls: the words heard so far (each call replaces the last, like interim results), and the end
      w.__say = (text: string) => speech.current?.onresult?.({ results: [[{ transcript: text }]] });
      w.__end = () => speech.current?.onend?.();
    },
    { supported, fail },
  );
}

const fullPage = (page: Page) => page.locator(".as-page:not(.is-panel)");
const speech = (page: Page) => page.evaluate(() => (window as unknown as { __speech: Speech }).__speech);

test("7.1: where the browser can't turn speech into text, the mic is greyed out and says why", async ({ page }) => {
  await fakeSpeech(page, { supported: false });
  await signIn(page, "admin");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  await expect(chat.locator(".as-voice")).toHaveClass(/is-off/);
  await chat.getByRole("button", { name: /Ask by voice/ }).click();
  await expect(chat.getByRole("alert")).toContainText("This browser can't turn speech into text");
});

test("7.2: the mic starts and stops, and the words appear in the box while you speak", async ({ page }) => {
  await fakeSpeech(page);
  await signIn(page, "admin");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  const box = chat.getByLabel("Your question");
  const mic = chat.getByRole("button", { name: /Ask by voice/ });
  await box.fill("Show me");
  await mic.click();
  await expect(chat.getByRole("button", { name: "Stop listening" })).toHaveAttribute("aria-pressed", "true");
  // Each result replaces the words heard so far, after what was already typed
  await page.evaluate(() => (window as unknown as { __say(t: string): void }).__say("today's"));
  await expect(box).toHaveValue("Show me today's");
  await page.evaluate(() => (window as unknown as { __say(t: string): void }).__say("today's bookings"));
  await expect(box).toHaveValue("Show me today's bookings");
  // Stop: back to the mic button; the words stay in the box to send
  await chat.getByRole("button", { name: "Stop listening" }).click();
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await expect(box).toHaveValue("Show me today's bookings");
  expect((await speech(page)).started).toBe(1);
});
