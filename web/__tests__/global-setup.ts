import { ensureTestUser } from "./helpers/ensureTestUser";

export default async function globalSetup() {
  console.log("🔹 Ensuring test users exist before tests run...");
  await ensureTestUser(1);
  await ensureTestUser(2);
  console.log("✅ Test users ensured");
}