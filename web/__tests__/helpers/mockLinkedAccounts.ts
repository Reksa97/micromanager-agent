import { Page } from "@playwright/test";
import { APP_URL, TEST_USERS } from "./config";

const TEST_TELEGRAM_ID = 999000001;
const { name } = TEST_USERS.user1;

export async function mockLinkedAccounts(page: Page) {
  await page.route(`${APP_URL}/api/user/linked-accounts`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: [{ type: "google", status: "connected" }],
          user: {
            id: TEST_TELEGRAM_ID.toString(),
            name: name,
          },
        }),
      })
    );
}