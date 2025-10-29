import { test, expect, request } from "@playwright/test";
import { authenticateUser } from "../helpers/authenticateUser";
import { ensureTestUser } from "../helpers/ensureTestUser";

test.describe("Memory Context API", () => {
  test("should retrieve and update user context", async ({ page }) => {
    // Step 1: Authenticate via UI and get Telegram JWT
    await ensureTestUser();
    const telegramJwt = await authenticateUser(page);

    // Step 2: Call context API directly with JWT in headers
    const res = await page.request.post("/api/context", {
      headers: {
        Authorization: `Bearer ${telegramJwt}`,
      },
      data: { action: "get" },
    });

    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.output).toBeDefined();
    expect(data.metadata).toHaveProperty("updatedAt");
  });
});