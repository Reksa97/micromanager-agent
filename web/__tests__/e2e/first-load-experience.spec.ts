import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test for First-Load Experience
 *
 * Tests the event-based first-load onboarding flow:
 * 1. Triggers backend tasks via POST /api/first-load/init
 * 2. Polls GET /api/first-load/status for progress
 * 3. Shows animated loading steps
 * 4. Completes and shows main chat interface
 */

const TEST_TELEGRAM_ID_NEW_USER = 888000001; // For first-load test
const TEST_TELEGRAM_ID_RETURNING = 888000002; // For returning user test
const TEST_TELEGRAM_ID_POLLING = 888000003; // For polling test
const TEST_USER_NAME = "First Load Test User";

// Mock Telegram authentication using dev mock mode
async function authenticateAsTelegramUser(page: Page, telegramId: number) {
  // Use the built-in mock mode for development
  await page.goto(
    `https://localhost:3000/telegram?mock_secret=dev-secret&mock_user_id=${telegramId}`
  );

  // Wait for authentication to complete and redirect
  await page.waitForURL("**/telegram-app**", { timeout: 10000 });
}

// Helper to reset user's first-load progress
async function resetUserProgress(page: Page, telegramId: number) {
  // Authenticate to get token
  const authResponse = await page.evaluate(async (userId) => {
    const res = await fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mockSecret: "dev-secret",
        mockUser: { id: userId },
      }),
    });
    return res.json();
  }, telegramId);

  if (authResponse.token) {
    // Reset progress
    await page.evaluate(async (token) => {
      await fetch("/api/dev/reset-progress", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }, authResponse.token);
  }
}

test.describe("First-Load Experience", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to base URL
    await page.goto("https://localhost:3000");

    // Clear browser storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("should show first-load experience for new users", async ({ page }) => {
    // Reset user data to ensure fresh first-load experience
    await resetUserProgress(page, TEST_TELEGRAM_ID_NEW_USER);

    // Clear storage again after reset
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Authenticate as a new Telegram user (will trigger first-load)
    await authenticateAsTelegramUser(page, TEST_TELEGRAM_ID_NEW_USER);

    // Wait for first-load experience to appear
    await page.waitForSelector("text=Welcome", { timeout: 5000 });

    // Verify welcome message is displayed
    const welcomeText = await page.textContent("h1");
    expect(welcomeText).toContain("Welcome");

    // Verify all loading steps are visible
    await expect(page.getByText("Getting to know you...")).toBeVisible();
    await expect(page.getByText("Preparing your assistant...")).toBeVisible();
    await expect(page.getByText("Setting up your experience...")).toBeVisible();
    await expect(page.getByText("Almost ready...")).toBeVisible();

    // Wait for progress to complete (should take ~5 seconds total)
    // The page should transition from first-load to the main app
    await page.waitForSelector("text=Micromanager", { timeout: 15000 });

    // Take screenshot for visual verification
    await page.screenshot({ path: "artifacts/first-load-complete.png" });

    // Verify we're on the telegram-app page
    expect(page.url()).toContain("/telegram-app");
  });

  test("should not show first-load for returning users", async ({ page }) => {
    // First auth to complete first-load
    await authenticateAsTelegramUser(page, TEST_TELEGRAM_ID_RETURNING);
    await page.waitForSelector("text=Micromanager", { timeout: 15000 });

    // Clear storage and re-authenticate - should NOT show first-load again
    await page.goto("https://localhost:3000");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await authenticateAsTelegramUser(page, TEST_TELEGRAM_ID_RETURNING);

    // Should NOT see first-load experience
    // Instead, should see chat interface immediately
    const welcomeElement = page.getByText(/Welcome.*!/);
    await expect(welcomeElement).not.toBeVisible({ timeout: 2000 });

    // Chat interface should be visible
    await page.waitForSelector("text=Micromanager", { timeout: 5000 });
  });

  test("should poll backend for real progress updates", async ({ page }) => {
    // Reset user data to ensure fresh first-load experience
    await resetUserProgress(page, TEST_TELEGRAM_ID_POLLING);

    // Clear storage again after reset
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Listen to network requests BEFORE authentication
    const statusRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/first-load/status")) {
        statusRequests.push(request.url());
      }
    });

    // Authenticate as a new Telegram user
    await authenticateAsTelegramUser(page, TEST_TELEGRAM_ID_POLLING);

    // Wait for first-load to start
    await page.waitForSelector("text=Welcome", { timeout: 5000 });

    // Wait a bit for polling to occur
    await page.waitForTimeout(3000);

    // Verify multiple status polling requests were made
    expect(statusRequests.length).toBeGreaterThan(3);
    console.log(`Made ${statusRequests.length} polling requests`);
  });
});
