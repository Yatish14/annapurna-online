import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./users";

/**
 * The admin on a phone (docs/mobile-app-plan.md, M13): every page fits the screen with the bottom tab bar, the pages
 * with a phone layout show it, and the desktop doesn't change (no tab bar, every section shown).
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** Every admin page that needs no id (the ones that do are found from the lists in the test below) */
const PAGES = [
  "/admin/print",
  "/admin/print/qr",
  "/admin/print/activity",
  "/admin/expenses",
  "/admin/expenses/bookings",
  "/admin/expenses/bookings/new",
  "/admin/expenses/fleet",
  "/admin/expenses/repairs",
  "/admin/expenses/fastag",
  "/admin/expenses/emi",
  "/admin/expenses/reports",
  "/admin/expenses/activity",
  "/admin/assistant",
  "/admin/users",
  "/admin/account",
  "/admin/more",
];

/** The first link on a page whose address matches, e.g. a booking from the bookings list */
async function firstLink(page: Page, list: string, pattern: RegExp): Promise<string | null> {
  await page.goto(list);
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.find((h) => pattern.test(h)) ?? null;
}

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test("every admin page fits the screen, with the tab bar and no sidebar", async ({ page }) => {
    await signIn(page, "owner");
    const booking = await firstLink(page, "/admin/expenses/bookings", /^\/admin\/expenses\/bookings\/VB-\d+$/);
    const vehicle = await firstLink(page, "/admin/expenses/fleet", /^\/admin\/expenses\/fleet\/\d+$/);
    const driver = await firstLink(page, "/admin/expenses/fleet", /^\/admin\/expenses\/fleet\/drivers\/\d+$/);
    const extra = [booking, booking && `${booking}/edit`, vehicle, driver].filter((u): u is string => Boolean(u));

    for (const url of [...PAGES, ...extra, "/admin/assistant/usage"]) {
      await page.goto(url);
      await expect(page.locator(".ap-tabbar"), url).toBeVisible();
      await expect(page.locator(".ap-side"), url).toBeHidden();
      // Nothing sticks out sideways: the page never scrolls left and right
      const wider = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(wider, `${url} is ${wider}px wider than the screen`).toBeLessThanOrEqual(1);
    }
  });

  test("the tab bar lights the right tab, and More lists the other pages", async ({ page }) => {
    await signIn(page, "admin");
    const lit = (url: string) => page.goto(url).then(() => page.locator(".ap-tab.is-active .ap-tab-label").textContent());
    expect(await lit("/admin/print")).toBe("Prints");
    expect(await lit("/admin/expenses/bookings")).toBe("Bookings");
    expect(await lit("/admin/assistant")).toBe("Assist");
    expect(await lit("/admin/expenses")).toBe("Overview");
    expect(await lit("/admin/expenses/fleet")).toBe("More");

    await page.goto("/admin/more");
    for (const name of ["QR poster", "Vehicles & drivers", "Repairs", "FASTag", "EMI & insurance", "Reports", "Users & roles", "My account"]) {
      await expect(page.locator(".mo-row", { hasText: name }).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("the phone layouts show: Overview summary, booking rows, a booking's money card", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/expenses");
    await expect(page.locator(".xp-mobsum")).toBeVisible();
    await expect(page.locator(".ap-tiles")).toBeHidden();

    await page.goto("/admin/expenses/bookings");
    await expect(page.locator(".xp-newfab")).toBeVisible();
    const row = page.locator(".xp-trip").first();
    await expect(row.locator(".xp-datetile")).toBeVisible();
    await expect(row.locator(".ap-card-foot")).toBeHidden();

    const booking = await firstLink(page, "/admin/expenses/bookings", /^\/admin\/expenses\/bookings\/VB-\d+$/);
    test.skip(!booking, "no booking in the test data");
    await page.goto(booking!);
    await expect(page.locator(".xp-mobbal")).toBeVisible();
    await expect(page.locator(".xp-sumtiles")).toBeHidden();
    await expect(page.locator(".xp-quick a", { hasText: "Call" })).toBeVisible();
    // The section bar jumps to the payments
    await page.locator(".xp-jump a", { hasText: "Money" }).click();
    await expect(page).toHaveURL(/#customer-payments$/);
  });

  test("the booking form goes one step at a time, and a missing field on another step opens that step", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/expenses/bookings/new");
    const form = page.locator("form.xp-form");
    await expect(form).toHaveAttribute("data-step", "1");
    await expect(page.locator(".xp-steps")).toContainText("Step 1 of 4");

    // Nothing filled: Next stays on step 1
    await page.locator(".xp-stepnext").click();
    await expect(form).toHaveAttribute("data-step", "1");

    // Customer filled: on to step 2, where the vehicle is still empty
    await page.locator("#trip-customer").fill("Phone Test Customer");
    await page.keyboard.press("Escape");
    await page.locator("input[name=customer_phone]").fill("9876543210");
    await page.locator(".xp-stepnext").click();
    await expect(form).toHaveAttribute("data-step", "2");

    // Straight to the last step, and Create: it goes back to step 2, to the vehicle, and nothing is saved
    await page.locator(".xp-steps li").nth(3).locator("button").click();
    await expect(form).toHaveAttribute("data-step", "4");
    await page.locator(".xp-formsave").click();
    await expect(form).toHaveAttribute("data-step", "2");
    await expect(page.locator('[data-for="vehicle_id"]')).toBeFocused();
    await expect(page).toHaveURL(/\/bookings\/new$/);
  });

  test("the installed app opens on the lotus splash, then the dashboard", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/launch");
    await expect(page).toHaveURL(/\/admin\/print$/);
    await expect(page.locator(".ap-tabbar")).toBeVisible();
  });
});

test.describe("on a desktop", () => {
  test.use({ viewport: DESKTOP });

  test("no phone parts: sidebar, no tab bar, the tiles and the whole booking form", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/expenses");
    await expect(page.locator(".ap-side")).toBeVisible();
    await expect(page.locator(".ap-tabbar")).toBeHidden();
    await expect(page.locator(".xp-mobsum")).toBeHidden();
    await expect(page.locator(".ap-tiles")).toBeVisible();

    await page.goto("/admin/expenses/bookings/new");
    await expect(page.locator(".xp-steps")).toBeHidden();
    await expect(page.locator(".xp-stepnext")).toBeHidden();
    // All six sections at once, and Create stops on the first empty field as it always did
    const sections = page.locator("form.xp-form > section");
    await expect(sections).toHaveCount(6);
    for (const section of await sections.all()) await expect(section).toBeVisible();
    await page.locator(".xp-formsave").click();
    await expect(page.locator("#trip-customer")).toBeFocused();
  });
});
