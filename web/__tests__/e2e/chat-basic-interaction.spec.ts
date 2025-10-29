import { test, expect, Page } from "@playwright/test";
import { authenticateUser } from "../helpers/authenticateUser";
import { clearStorage } from "../helpers/clearStorage";
import { ensureTestUser } from "../helpers/ensureTestUser";


test.describe("Chat Interface", () => {
  let jwtToken: string;

  test.beforeAll(async () => {
    // Ensure the test user exists before running tests
    await ensureTestUser();
  });

  test.beforeEach(async ({ page }) => {
    // Each test starts with a fresh authenticated session
    await clearStorage(page);
    jwtToken = await authenticateUser(page);

    // Each test starts from the main chat interface
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Micromanager" })).toBeVisible();
  });

  test("should display welcome message and chat input", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Micromanager" })).toBeVisible();
    await expect(page.getByPlaceholder(/Type your message.../i)).toBeVisible();
  });

  test("should send message and receive AI response", async ({ page }) => {
    const chatInput = page.getByPlaceholder(/Type your message.../i);
    await chatInput.fill("Hello Micromanager!");
    await chatInput.press("Enter");

    await page.waitForSelector('text=AGENT', { timeout: 30000 });
    const assistantMessages = page.locator('span.text-sm.leading-relaxed.font-normal');
    const messageCount = (await assistantMessages.all()).length;

    expect(messageCount).toBeGreaterThan(0);
  });

  test("should maintain chat history after reload", async ({ page }) => {
    const chatInput = page.getByPlaceholder(/Type your message.../i);
    await chatInput.fill("Remember this message!");
    await chatInput.press("Enter");

    await page.waitForFunction(() => {
      const el = document.querySelector('span.text-sm.leading-relaxed.font-normal');
      return el && el.textContent && el.textContent.trim().length > 0;
    }, { timeout: 30000 });

    await page.reload();

    await page.waitForFunction(() => {
      const el = document.querySelector('span.text-sm.leading-relaxed.font-normal');
      return el && el.textContent && el.textContent.trim().length > 0;
    }, { timeout: 30000 });

    const assistantMessages = page.locator('span.text-sm.leading-relaxed.font-normal');
    const lastMessage = await assistantMessages.last().textContent();

    expect(lastMessage?.trim().length).toBeGreaterThan(0);
  });
});