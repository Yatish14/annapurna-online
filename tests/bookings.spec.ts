import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./users";

// The booking form, through the browser like a person uses it. Its checks live in lib/expenses/tripInput.ts, shared
// with Annapurna Assist's drafts (task 4.1), so this makes sure the form still saves and still refuses what it should.
//
// It adds a booking (VB-0003) to the test database. Files run one at a time in name order, so assistant.spec.ts,
// which counts the 2 test bookings, has already run. A test that needs to count bookings goes before this file.

/** A date some days from today in India, as the date box wants it: "2026-11-20" */
const inDays = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(Date.now() + n * 86_400_000);

/** Opens one of the form's dropdowns (a combobox) and picks an option, like a click would */
async function choose(page: Page, box: string, option: string) {
  await page.getByRole("combobox", { name: box }).click();
  await page.getByRole("option", { name: option, exact: true }).first().click();
}

test("the booking form refuses a busy vehicle and saves a free one", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/expenses/bookings/new");

  await page.locator('input[name="customer_name"]').fill("Form Test Customer");
  await page.locator('input[name="customer_phone"]').fill("9000000011");
  await choose(page, "Vehicle", "Test Carens");
  await choose(page, "Driver", "Test Driver · 90000 00009"); // drivers show their phone, so two with one name differ
  // The same days as test booking VB-0001 (3 days from today, for 2 days): the vehicle is busy
  await page.locator('input[name="start_date"]').fill(inDays(3));
  await page.locator('input[name="end_date"]').fill(inDays(4));
  await choose(page, "Pickup state", "Andhra Pradesh");
  await page.getByRole("combobox", { name: "Pickup city" }).fill("Vijayawada");
  await choose(page, "Drop state", "Telangana");
  await page.getByRole("combobox", { name: "Drop city" }).fill("Hyderabad");

  // checkTrip refuses it with the same words as before the checks moved
  await page.getByRole("button", { name: "Create booking" }).click();
  await expect(page.getByText("Test Carens is already booked on these days: VB-0001")).toBeVisible();

  // Free days: saved, and the new booking's page opens
  await page.locator('input[name="start_date"]').fill(inDays(40));
  await page.locator('input[name="end_date"]').fill(inDays(41));
  await page.getByRole("button", { name: "Create booking" }).click();
  await expect(page).toHaveURL(/\/admin\/expenses\/bookings\/VB-0003/);
  await expect(page.getByText("Booking VB-0003 created.")).toBeVisible();
  await expect(page.getByText("Form Test Customer").first()).toBeVisible();
});
