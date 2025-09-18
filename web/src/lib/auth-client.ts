import clientPromise from "@/lib/db";

export async function getAuthClient() {
  return clientPromise;
}
