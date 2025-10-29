import { test, expect, Page } from "@playwright/test";
import { authenticateUser } from "../helpers/authenticateUser";
import { clearStorage } from "../helpers/clearStorage";


test.describe("Chat Interface", () => {

  test.beforeEach(async ({ page }) => {
    // Each test starts with a fresh authenticated session
    await clearStorage(page);
    await authenticateUser(page);
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
    const userMessage = "Remember this message!";

    // Send the message
    await chatInput.fill(userMessage);
    await chatInput.press("Enter");

    // Wait for the sent message to appear in the chat
    await page.waitForSelector(`text=${userMessage}`, { timeout: 60000 });

    // Optionally, wait for an assistant reply to appear
    await page.waitForFunction(() => {
      const spans = document.querySelectorAll('span.text-sm.leading-relaxed.font-normal');
      return spans.length > 1;
    }, { timeout: 60000 });

    // Reload the page
    await page.reload();

    // Wait for the same message to reappear after reload (persisted chat history)
    await page.waitForSelector(`text=${userMessage}`, { timeout: 60000 });

    // Assert the chat history is still visible
    const chatText = await page.locator("body").innerText();
    expect(chatText).toContain(userMessage);
  });
});