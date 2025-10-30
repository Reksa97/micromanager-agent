import { Page } from "@playwright/test";
import { APP_URL } from "./config";

export async function resetProgress(page: Page, token: string) {
  await page.request.post(`${APP_URL}/api/dev/reset-progress`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}