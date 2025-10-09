import { test, expect, Page } from "@playwright/test";

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
const TEST_USER_NAME = "Test User";

// Mock Telegram authentication by setting localStorage token
async function authenticateAsTelegramUser(page: Page, telegramId: number) {
  await page.goto("http://localhost:3000/telegram");

  // In real scenario, this would be set by the Telegram OAuth flow
  // For testing, we simulate it by directly setting the token
  await page.evaluate(
    ({ telegramId, userName }) => {
      // Mock JWT token (in production, this comes from /api/auth/telegram)
      const mockToken = `mock-telegram-jwt-${telegramId}`;
      localStorage.setItem("telegram-token", mockToken);

      // Store user info
      localStorage.setItem(
        "telegram-user",
        JSON.stringify({
          id: telegramId.toString(),
          name: userName,
          telegramId,
        })
      );
    },
    { telegramId, userName: TEST_USER_NAME }
  );

  // Navigate to authenticated app
  await page.goto("http://localhost:3000/telegram-app");
}

test.describe("Telegram-Google Calendar Linking", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto("http://localhost:3000");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("should show Connect Google Calendar button", async ({ page }) => {
    // Authenticate as Telegram user
    await authenticateAsTelegramUser(page, TEST_TELEGRAM_ID);

    // Wait for app to load
    await page.waitForLoadState("networkidle");

    // Look for Connect Google Calendar button
    // Note: This assumes the button exists in the UI - it needs to be added
    const connectButton = page.getByRole("button", {
      name: /connect google calendar/i,
    });

    // If button doesn't exist, test will fail
    await expect(connectButton).toBeVisible();
  });

  test("should initiate Google OAuth flow", async ({ page, context }) => {
    // Authenticate as Telegram user
    await authenticateAsTelegramUser(page, TEST_TELEGRAM_ID);

    // Wait for app to load
    await page.waitForLoadState("networkidle");

    // Click Connect Google Calendar button
    const connectButton = page.getByRole("button", {
      name: /connect google calendar/i,
    });

    // Listen for navigation to Google OAuth
    const [oauthPage] = await Promise.all([
      context.waitForEvent("page"),
      connectButton.click(),
    ]);

    // Verify we're redirected to Google OAuth
    await oauthPage.waitForLoadState("networkidle");
    expect(oauthPage.url()).toContain("accounts.google.com/o/oauth2");

    // Verify state parameter is present
    const url = new URL(oauthPage.url());
    expect(url.searchParams.has("state")).toBe(true);
    expect(url.searchParams.get("scope")).toContain("calendar");
    expect(url.searchParams.get("access_type")).toBe("offline");
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

    // Should redirect to Google OAuth
    expect(response.status()).toBe(307); // Redirect
    expect(response.headers()["location"]).toContain("accounts.google.com");
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
    expect(data.error).toContain("telegramId is required");
  });
});

test.describe("Google Calendar Features (After Linking)", () => {
  test.beforeEach(async ({ page }) => {
    // For these tests, assume Google account is already linked
    await authenticateAsTelegramUser(page, TEST_TELEGRAM_ID);
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
