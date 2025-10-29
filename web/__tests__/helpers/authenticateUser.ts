import { Page } from "@playwright/test";
import { APP_URL, TEST_USERS } from "./config";
import { decodeJwt } from "jose";

export async function authenticateUser(page: Page, userNumber = 1): Promise<string> {
  const TEST_USER = userNumber === 1 ? TEST_USERS.user1 : TEST_USERS.user2;
  const { email, password } = TEST_USER;

  await page.goto(`${APP_URL}/test-login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/telegram-app**", { timeout: 10000 });

  const token = await page.evaluate(() => localStorage.getItem("telegram-token"));
  if (!token) throw new Error("Telegram token not found after login");
  return token;
}