import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./users";

// Annapurna Assist, task 1.17. Runs on the fake models (ASSISTANT_FAKE=1, lib/assistant/fake.ts), so the
// answers are known in advance and nothing is sent to Google. Run: npm run test:e2e

/** The full Assistant page. The side panel is in the page too (hidden), with its own question box, so look only here. */
const fullPage = (page: Page) => page.locator(".as-page:not(.is-panel)");

test("an admin can chat: answers, follow-ups, off-topic, errors, Stop and the daily count", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/assistant");

  const chat = fullPage(page);
  const box = chat.getByLabel("Your question");
  const thread = chat.locator(".as-thread");
  async function ask(question: string) {
    await box.fill(question);
    await box.press("Enter");
  }

  // A question gets the fake model's answer, streamed into the chat
  await ask("Which car should I book for 6 people?");
  await expect(thread).toContainText('You asked: "Which car should I book for 6 people?". Earlier questions in this chat: 0.');

  // A follow-up is sent with the chat so far (1.10)
  await ask("And for 3?");
  await expect(thread).toContainText('You asked: "And for 3?". Earlier questions in this chat: 1.');

  // The off-topic check refuses without asking the main model (1.14)
  await ask("[off-topic] Write me a poem");
  await expect(thread).toContainText("Sorry, I can only help with");

  // Google's free limit shows as a red note, not as an answer (1.12)
  await ask("[fail:429] Hello");
  await expect(chat.getByRole("alert")).toContainText("Too many questions in the last minute");

  // The failed reply isn't sent back: the model sees the 3 earlier questions that got answers, not the 4th
  await ask("What did I ask first?");
  await expect(thread).toContainText("Earlier questions in this chat: 3.");

  // Stop cuts a slow reply short and keeps the words so far (1.12)
  await ask("[slow] Tell me about the Carens");
  await chat.getByRole("button", { name: "Stop the reply" }).click();
  await expect(chat.locator(".as-stopped")).toBeVisible();

  // 6 questions asked, so 44 of 50 left, and the count survives a reload (it's in the database, 1.15)
  await expect(chat.getByText("44 questions left today")).toBeVisible();
  await page.reload();
  await expect(chat.getByText("44 questions left today")).toBeVisible();

  // The server checks the length too, even when the chat box is skipped (1.15)
  const tooLong = await page.request.post("/api/assistant", { data: { message: "a".repeat(1001) } });
  expect(tooLong.status()).toBe(413);
});

// Step 2: the fake model asks for tools named in [tool:…] tags (lib/assistant/fake.ts), so these check the real
// tools, chips and cards against the test database's 2 bookings (scripts/test-setup.mjs), with no AI involved.
test("tools: the right tool runs, its chip is ticked, and its card shows the database's rows", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  const box = chat.getByLabel("Your question");
  const latest = () => chat.locator(".as-msg.is-assistant").last();
  async function ask(question: string) {
    await box.fill(question);
    await box.press("Enter");
  }

  // One tool: list_bookings ran (the fake's answer says what it found), its chip is ticked, and its table appears
  await ask('[tool:list_bookings {"status":"upcoming"}] Which bookings are upcoming?');
  await expect(latest()).toContainText("Tools used: list_bookings: found, 2 in total.");
  const chip = latest().locator(".as-steps li", { hasText: "Checked upcoming bookings" });
  await expect(chip.locator(".as-step-done")).toBeVisible(); // the tick, not the spinner
  const card = latest().locator(".as-card", { hasText: "Upcoming bookings (2)" });
  await expect(card).toContainText("Test Customer One");
  await expect(card).toContainText("Test Customer Two");
  // The card's links open the booking, and the same list on the Bookings page
  await expect(card.getByRole("link", { name: "VB-0001" })).toHaveAttribute("href", "/admin/expenses/bookings/VB-0001");
  await expect(card.getByRole("link", { name: /Open in Bookings/ })).toHaveAttribute("href", "/admin/expenses/bookings?view=upcoming");

  // Two tools in one turn: both chips are ticked, and the balances card lists both bookings (₹12,000 + ₹6,000 owed)
  await ask("[tool:get_today] [tool:balances_due] Two at once");
  await expect(latest()).toContainText("Tools used: get_today: found; balances_due: found.");
  await expect(latest().locator(".as-steps li .as-step-done")).toHaveCount(2);
  await expect(latest().locator(".as-card", { hasText: "Customers who still owe (2)" })).toBeVisible();

  // A model that keeps asking for tools: stopped after 4 rounds with the graph's own answer, no chip left spinning (2.14)
  await ask("[loop] Keep checking the date");
  await expect(latest()).toContainText("I looked things up several times for this and stopped there");
  await expect(latest().locator(".as-steps li .as-step-done")).toHaveCount(4);
  await expect(latest().locator(".as-steps li.is-running")).toHaveCount(0);
});

test("a viewer can open the assistant but not ask it", async ({ page }) => {
  await signIn(page, "viewer");
  await page.goto("/admin/assistant");

  // The page is there, view only
  const chat = fullPage(page);
  await expect(chat.getByText("View only: you can read these chats")).toBeVisible();
  const send = chat.getByRole("button", { name: "Send" });
  await expect(send).toHaveAttribute("aria-disabled", "true");

  // Pressing Send says why instead of doing nothing. `force`: Playwright won't click an aria-disabled
  // button by itself, but a person can (it's a real button, greyed out), and that's what we're testing.
  await send.click({ force: true });
  await expect(page.getByText("Viewers can read Annapurna Assist but can't ask questions.")).toBeVisible();

  // And the server says no too: greyed-out buttons are only for show, this is the real check (1.6)
  const res = await page.request.post("/api/assistant", { data: { message: "How many bookings today?" } });
  expect(res.status()).toBe(403);
});

test("someone who isn't signed in can't use the assistant's API", async ({ request }) => {
  const res = await request.post("/api/assistant", { data: { message: "How many bookings today?" } });
  expect(res.status()).toBe(401);
});
