import { Page } from "@playwright/test";
import { APP_URL } from "./config";

export async function clearStorage(page: Page) {

  await page.goto(APP_URL);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}