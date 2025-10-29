import { test, expect, Page } from "@playwright/test";
import { authenticateUser } from "../helpers/authenticateUser";
import { clearStorage } from "../helpers/clearStorage";
import { mockLinkedAccounts } from "../helpers/mockLinkedAccounts";
import dotenv from "dotenv";

dotenv.config();

test.describe("Google Calendar Integration", () => {
  
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    const jwtToken = await authenticateUser(page);
    await authenticateUser(page);
  });

  test("should display connected Google account", async ({ page }) => {
    // Mock linked accounts API
    await mockLinkedAccounts(page);

    // Wait for app to load
    await page.waitForLoadState("networkidle");

    // Open Settings
    const settingsButton = page.locator('button:has(svg.lucide-settings)');
    await settingsButton.click();

    // Wait up to 10s for the "Connected" badge to appear
    const googleAccount = page.locator('div:has-text("Google")');
    const connectedBadge = googleAccount.locator('text=Connected');
    await connectedBadge.waitFor({ state: "visible", timeout: 10000 });
    await expect(connectedBadge).toBeVisible();
  });

  test("should fetch and display today's events", async ({ page }) => {
    test.skip(true, "Requires linked Google account with calendar events");

    const input = page.getByPlaceholder(/Type your message.../i);
    await input.fill("What's on my calendar today?");
    await input.press("Enter");

    const assistantMessages = page.locator('span.text-sm.leading-relaxed.font-normal');
    const lastMessage = await assistantMessages.last().textContent();
    expect(lastMessage?.toLowerCase()).toContain("calendar");
  });
});