import { expect, type Page } from "@playwright/test";

/** The test sign-ins made by scripts/test-setup.mjs (test data only) */
export const USERS = {
  admin: { mobile: "9000000002", name: "Test Admin" },
  viewer: { mobile: "9000000003", name: "Test Viewer" },
};
const PASSWORD = "test-password-123";

/** Signs in through the real login form, like a person would, and waits for the dashboard */
export async function signIn(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(USERS[who].mobile);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}
