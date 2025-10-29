import { test, expect, Page } from "@playwright/test";
import { authenticateUser } from "../helpers/authenticateUser";
import { clearStorage } from "../helpers/clearStorage";

/**
 * E2E Test for Telegram-Google Calendar Linking
 *
 * Prerequisites:
 * 1. Local dev server running (npm run dev)
 * 2. MongoDB accessible
 * 3. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 * 4. Test Telegram user in database
 */

const TEST_TELEGRAM_ID = 999000000;

test.describe("Telegram-Google Calendar Linking", () => {
  
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    const jwtToken = await authenticateUser(page);
    await authenticateUser(page);
  });

  test("should show Connect Google Calendar button", async ({ page }) => {
    // Wait for app to load
    await page.waitForLoadState("networkidle");

    // Open Settings
    const settingsButton = page.locator('button:has(svg.lucide-settings)');
    await settingsButton.click();

    // Look for Connect Google Calendar button
    // Note: This assumes the button exists in the UI - it needs to be added
    const googleAccount = page.locator('div:has-text("Google")');
    const connectButton = googleAccount.locator('button:has-text("Connect")');
    await connectButton.waitFor({ state: "visible", timeout: 10000 });
    await expect(connectButton).toBeVisible();
  });

  test("should initiate linking flow", async ({ page, context }) => {

    // Wait for app to load
    await page.waitForLoadState("networkidle");

    // Open Settings
    const settingsButton = page.locator('button:has(svg.lucide-settings)');
    await settingsButton.click();

    // Click Connect Google Calendar button
    const googleAccount = page.locator('div:has-text("Google")');
    const connectButton = googleAccount.locator('button:has-text("Connect")');

    // Wait until the button is visible and enabled
    await connectButton.waitFor({ state: "visible", timeout: 10000 });

    // Listen for navigation to Google OAuth
    const [linkingPage] = await Promise.all([
      context.waitForEvent("page"),
      connectButton.click(),
    ]);

    // Verify we're redirected to Google OAuth
    await linkingPage.waitForLoadState("networkidle");
    expect(linkingPage.url()).toContain("https://micromanager-agent.vercel.app/link-telegram");
  });

  test("should link Google account after OAuth callback", async ({
    page,
    context,
  }) => {
    // This test requires manual OAuth completion or mocking
    // In a real test, you would:
    // 1. Mock the Google OAuth callback
    // 2. Or use a test Google account
    // 3. Verify the account is linked in MongoDB

    test.skip(
      true,
      "Requires OAuth completion - run manually or with mocked Google API"
    );

    // Example flow (when implemented):
    // 1. Authenticate as Telegram user
    // 2. Click Connect Google Calendar
    // 3. Complete OAuth (mocked or real)
    // 4. Verify success message
    // 5. Query MongoDB to verify account is linked
  });

  test("should allow direct linking via API endpoint", async ({ request }) => {
    // Test the linking endpoint directly
    const response = await request.get(
      `/api/auth/google/link?telegramId=${TEST_TELEGRAM_ID}`
    );

    expect(response.ok()).toBeTruthy();
    const body = await response.text();

    expect(body).toContain("Google");
  });

  test("should show error for invalid telegram ID", async ({ request }) => {
    const response = await request.get(`/api/auth/google/link?telegramId=abc`);

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid telegramId");
  });

  test("should show error for missing telegram ID", async ({ request }) => {
    const response = await request.get(`/api/auth/google/link`);

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("telegramId or token is required");
  });
});

test.describe("Google Calendar Features (After Linking)", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await authenticateUser(page);
  });

  test("should access Google Calendar via agent tools", async ({ page }) => {
    test.skip(true, "Requires linked Google account");

    // Navigate to chat
    await page.goto("http://localhost:3000/telegram-app");

    // Send a message to check calendar
    const chatInput = page.getByPlaceholder(/type a message/i);
    await chatInput.fill("What's on my calendar today?");
    await chatInput.press("Enter");

    // Wait for AI response
    await page.waitForSelector('[data-role="assistant"]', { timeout: 30000 });

    // Verify response mentions calendar events
    const response = await page
      .locator('[data-role="assistant"]')
      .last()
      .textContent();

    expect(response).toBeTruthy();
    // Should not show auth errors
    expect(response?.toLowerCase()).not.toContain("not authenticated");
    expect(response?.toLowerCase()).not.toContain("permission denied");
  });

  test("should handle expired tokens gracefully", async ({ page }) => {
    test.skip(true, "Requires token expiry simulation");

    // This test would:
    // 1. Set an expired token in MongoDB
    // 2. Make a calendar request
    // 3. Verify auto-refresh happens
    // 4. Verify request succeeds after refresh
  });
});
