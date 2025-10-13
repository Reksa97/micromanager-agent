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

// Test user credentials for E2E testing
const TEST_USERS = [
  {
    email: "test1@e2e.local",
    password: "TestPassword123!",
    name: "Test User 1",
  },
  {
    email: "test2@e2e.local",
    password: "TestPassword123!",
    name: "Test User 2",
  },
  {
    email: "test3@e2e.local",
    password: "TestPassword123!",
    name: "Test User 3",
  },
];

// Authenticate using test-login page with real next-auth
async function authenticateAsTelegramUser(
  page: Page,
  userIndex: number
) {
  const testUser = TEST_USERS[userIndex];

  // First, ensure user exists (try to register, ignore if already exists)
  await page.goto("https://localhost:3000/register");
  await page.fill('input[name="name"]', testUser.name);
  await page.fill('input[name="email"]', testUser.email);
  await page.fill('input[name="password"]', testUser.password);
  await page.click('button[type="submit"]').catch(() => {
    // User might already exist, that's okay
  });

  // Wait a bit for registration to complete
  await page.waitForTimeout(1000);

  // Use the test-login page with real credentials
  await page.goto("https://localhost:3000/test-login");

  // Fill in the email and password
  await page.fill('input[type="email"]', testUser.email);
  await page.fill('input[type="password"]', testUser.password);

  // Click sign in button
  await page.click('button[type="submit"]');

  // Wait for authentication to complete and redirect
  await page.waitForURL("**/telegram-app**", { timeout: 10000 });
}

// Helper to reset user's first-load progress
async function resetUserProgress(page: Page, userIndex: number) {
  const testUser = TEST_USERS[userIndex];

  // Authenticate to get token via test-login page
  const authResponse = await page.evaluate(
    async ({ email, password }) => {
      // Sign in with next-auth
      const signInRes = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!signInRes.ok) {
        return { error: "Sign in failed" };
      }

      // Convert session to telegram token
      const convertRes = await fetch("/api/dev/test-login/convert-session", {
        method: "POST",
      });

      return convertRes.json();
    },
    { email: testUser.email, password: testUser.password }
  );

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
    await resetUserProgress(page, 0);

    // Clear storage again after reset
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Authenticate as test user (will trigger first-load)
    await authenticateAsTelegramUser(page, 0);

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
    await authenticateAsTelegramUser(page, 1);
    await page.waitForSelector("text=Micromanager", { timeout: 15000 });

    // Clear storage and re-authenticate - should NOT show first-load again
    await page.goto("https://localhost:3000");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await authenticateAsTelegramUser(page, 1);

    // Should NOT see first-load experience
    // Instead, should see chat interface immediately
    const welcomeElement = page.getByText(/Welcome.*!/);
    await expect(welcomeElement).not.toBeVisible({ timeout: 2000 });

    // Chat interface should be visible
    await page.waitForSelector("text=Micromanager", { timeout: 5000 });
  });

  test("should poll backend for real progress updates", async ({ page }) => {
    // Reset user data to ensure fresh first-load experience
    await resetUserProgress(page, 2);

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

    // Authenticate as test user
    await authenticateAsTelegramUser(page, 2);

    // Wait for first-load to start
    await page.waitForSelector("text=Welcome", { timeout: 5000 });

    // Wait a bit for polling to occur
    await page.waitForTimeout(3000);

    // Verify multiple status polling requests were made
    expect(statusRequests.length).toBeGreaterThan(3);
    console.log(`Made ${statusRequests.length} polling requests`);
  });
});
