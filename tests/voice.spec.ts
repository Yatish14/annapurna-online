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

test("7.3: the language picker sets the language the browser listens for", async ({ page }) => {
  await fakeSpeech(page);
  await signIn(page, "admin");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  // Telugu unless another is picked
  await chat.getByRole("button", { name: "Ask by voice in Telugu" }).click();
  expect((await speech(page)).lang).toBe("te-IN");
  await page.evaluate(() => (window as unknown as { __end(): void }).__end());
  await chat.getByRole("button", { name: /Language you'll speak/ }).click();
  await chat.getByRole("menuitemradio", { name: /Hindi/ }).click();
  await chat.getByRole("button", { name: "Ask by voice in Hindi" }).click();
  expect((await speech(page)).lang).toBe("hi-IN");
});

test("7.4: while it listens, the box and the mic show it (the pulsing animation)", async ({ page }) => {
  await fakeSpeech(page);
  await signIn(page, "admin");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  await chat.getByRole("button", { name: /Ask by voice/ }).click();
  await expect(chat.locator(".as-inputbox")).toHaveClass(/is-listening/);
  await expect(chat.getByLabel("Your question")).toHaveAttribute("placeholder", "Listening…");
  await expect(chat.locator(".as-voice")).toHaveClass(/is-on/);
});

test("7.4: if the browser blocks the microphone, the chat says how to allow it", async ({ page }) => {
  await fakeSpeech(page, { fail: "not-allowed" });
  await signIn(page, "admin");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  await chat.getByRole("button", { name: /Ask by voice/ }).click();
  await expect(chat.getByRole("alert")).toContainText("The microphone is blocked for this site");
  await expect(chat.locator(".as-inputbox")).not.toHaveClass(/is-listening/);
});

test("7.5: by default the words wait in the box to check; with 'Send when I stop talking' they're sent straight away", async ({ page }) => {
  await fakeSpeech(page);
  await signIn(page, "admin");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  const box = chat.getByLabel("Your question");
  const say = (t: string) => page.evaluate((t) => (window as unknown as { __say(t: string): void }).__say(t), t);
  const end = () => page.evaluate(() => (window as unknown as { __end(): void }).__end());

  // Off (the default): listening ends, the words stay in the box, nothing is sent
  await chat.getByRole("button", { name: /Ask by voice/ }).click();
  await say("How many bookings this week");
  await end();
  await expect(box).toHaveValue("How many bookings this week");
  await expect(chat.locator(".as-msg.is-user")).toHaveCount(0);
  await box.fill("");

  // On: sent as soon as listening ends, marked as spoken (the mic beside the time)
  await chat.getByRole("button", { name: /Language you'll speak/ }).click();
  const auto = chat.getByRole("menuitemcheckbox", { name: /Send when I stop talking/ });
  await expect(auto).toHaveAttribute("aria-checked", "false");
  await auto.click();
  await expect(auto).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await chat.getByRole("button", { name: /Ask by voice/ }).click();
  await say("Which bookings are upcoming");
  await end();
  const question = chat.locator(".as-msg.is-user").last();
  await expect(question).toContainText("Which bookings are upcoming");
  await expect(question.locator("svg")).toHaveCount(1); // the mic icon: it was spoken
  await expect(box).toHaveValue("");
  await expect(chat.locator(".as-msg.is-assistant").last()).toContainText("You asked: \"Which bookings are upcoming\"");

  // Remembered in this browser
  await page.reload();
  await fullPage(page).getByRole("button", { name: /Language you'll speak/ }).click();
  await expect(fullPage(page).getByRole("menuitemcheckbox", { name: /Send when I stop talking/ })).toHaveAttribute("aria-checked", "true");
});
