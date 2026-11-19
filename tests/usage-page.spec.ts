import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./users";

/** 8.3: the usage page, for the super admin only. The fake models report pretend token counts, priced as Flash-Lite. */

const fullPage = (page: Page) => page.locator(".as-page:not(.is-panel)");

test("the super admin sees each question's tokens, time and paid-tier cost; an admin can't open the page", async ({ page, browser }) => {
  await signIn(page, "owner");
  await page.goto("/admin/assistant");
  const chat = fullPage(page);
  const box = chat.getByLabel("Your question");
  await box.fill('[tool:get_today] What is the date?');
  await box.press("Enter");
  await expect(chat.locator(".as-msg.is-assistant").last()).toContainText("Tools used: get_today: found.");
  await expect(chat.getByRole("button", { name: "Stop the reply" })).toHaveCount(0);
  await box.fill("[off-topic] Write me a poem");
  await box.press("Enter");
  await expect(chat.locator(".as-msg.is-assistant").last()).toContainText("only help with");

  // The link in the header (super admin only), then the page
  await chat.getByRole("link", { name: "Usage and cost" }).click();
  await expect(page).toHaveURL(/\/admin\/assistant\/usage$/);
  await expect(page.getByRole("heading", { name: "Assistant usage" })).toBeVisible();
  // The row is saved when the title's call has finished too, just after the answer: a reload may be needed
  await expect(async () => {
    await page.reload();
    // Only this test's rows: other tests ask as the admin, and the page lists everyone's questions
    const latest = page.locator(".as-usage-recent tbody tr", { hasText: "Test Owner" });
    await expect(latest.filter({ hasText: "Off topic" })).toHaveCount(1, { timeout: 1000 });
    await expect(latest.filter({ hasText: "get_today" })).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const answered = page.locator(".as-usage-recent tbody tr", { hasText: "Test Owner" }).filter({ hasText: "get_today" });
  await expect(answered).toContainText("Answered");
  await expect(answered).toContainText("Test Owner");
  // A fake answer is priced like Flash-Lite: a fraction of a rupee
  await expect(answered.locator("td").last()).toHaveText(/^₹0\.\d+$/);
  await expect(page.getByText("Answers (model and tools)")).toBeVisible();
  await expect(page.getByText("Off-topic check")).toBeVisible();
  await expect(page.getByText("real cost ₹0")).toBeVisible();

  // An admin: no link, and the address sends them away
  const other = await browser.newPage();
  await signIn(other, "admin");
  await other.goto("/admin/assistant");
  await expect(fullPage(other).getByRole("link", { name: "Usage and cost" })).toHaveCount(0);
  await other.goto("/admin/assistant/usage");
  await expect(other).toHaveURL(/flash=forbidden/);
  await other.close();
});
