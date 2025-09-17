import client from "@/lib/db";

export async function getAuthClient() {
  try {
    await client.db().command({ ping: 1 });
  } catch {
    await client.connect();
  }
  return client;
}
