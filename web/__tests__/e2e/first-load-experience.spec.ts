import { test, expect, Page } from "@playwright/test";
import { authenticateUser } from "../helpers/authenticateUser";
import { clearStorage } from "../helpers/clearStorage";
import { resetProgress } from "../helpers/resetProgress";
import dotenv from "dotenv";

dotenv.config();

// --- Main test suite ---
test.describe.serial("First-Load Experience", () => {
  let jwtToken: string;

  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    jwtToken = await authenticateUser(page, 2);
  });

  test("should show first-load experience for new users", async ({ page }) => {
    await resetProgress(page, jwtToken);
    await authenticateUser(page, 2);

    // Wait for first-load onboarding UI
    await page.waitForSelector("text=Welcome", { timeout: 8000 });
    await expect(page.locator("h1")).toContainText("Welcome");

    // Verify onboarding steps appear
    await expect(page.getByText("Getting to know you...")).toBeVisible();
    await expect(page.getByText("Preparing your assistant...")).toBeVisible();
    await expect(page.getByText("Setting up your experience...")).toBeVisible();
    await expect(page.getByText("Almost ready...")).toBeVisible();

    // Wait for transition into chat interface
    await page.waitForSelector("text=Micromanager", { timeout: 20000 });
    expect(page.url()).toContain("/telegram-app");

    await page.screenshot({ path: "artifacts/first-load-complete.png" });
  });

  test("should skip first-load for returning users", async ({ page }) => {
    await authenticateUser(page, 2);
    await page.waitForSelector("text=Micromanager", { timeout: 15000 });

    await clearStorage(page);

    await authenticateUser(page, 2);

    const welcomeElement = page.getByText(/Welcome/i);
    await expect(welcomeElement).not.toBeVisible({ timeout: 2000 });

    await page.waitForSelector("text=Micromanager", { timeout: 8000 });
  });

  test("should poll backend for real progress updates", async ({ page }) => {
    await resetProgress(page, jwtToken);
    await authenticateUser(page, 2);

    const statusRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/first-load/status")) {
        statusRequests.push(req.url());
      }
    });
    await page.waitForSelector("text=Welcome", { timeout: 8000 });

    await page.waitForTimeout(3000);
    expect(statusRequests.length).toBeGreaterThan(3);
    console.log(`✅ Polled ${statusRequests.length} times for progress`);
  });
});