import { APP_URL, TEST_USERS } from "./config";

export async function ensureTestUser(userNumber = 1) {
  const TEST_USER = userNumber === 1 ? TEST_USERS.user1 : TEST_USERS.user2;
  const { email, password, name, tier } = TEST_USER;

  console.log(`Ensuring test user tier: ${tier}`);
  const response = await fetch(`${APP_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, tier }),
  });

  // ✅ If user already exists, ignore the error and continue
  if (response.status === 409) {
    return { ok: true, alreadyExists: true };
  }

  // ❌ If other errors occur, surface them
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Failed to register user: ${data.error || response.statusText}`);
  }

  return { ok: true, alreadyExists: false };
}