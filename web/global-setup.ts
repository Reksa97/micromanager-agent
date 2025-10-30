import { chromium } from "@playwright/test";
import { ensureTestUser } from "./__tests__/helpers/ensureTestUser";
import { authenticateUser } from "./__tests__/helpers/authenticateUser";
import dotenv from "dotenv";

dotenv.config();

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL = process.env.TEST_USER1_EMAIL || "chatuser@e2e.local";
const PASSWORD = process.env.TEST_USER1_PASSWORD || "TestPassword123!";

export default async function globalSetup() {
  console.log("🔹 [Setup] Ensuring test user exists...");
  await ensureTestUser();
  await ensureTestUser(2);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const token = await authenticateUser(page);

  try {
    const response = await fetch(`${APP_URL}/api/first-load/init`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to initialize first-load");
    }

    console.log("[First Load] Initialization complete");
  } catch (error) {
    console.error("[First Load] Error initializing:", error);
  }

}