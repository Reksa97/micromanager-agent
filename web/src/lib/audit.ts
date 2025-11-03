import { getMongoClient } from "./db";

const db = (await getMongoClient()).db();

export async function getUsageLogsForUser(userId: string) {
  return db.collection("usage_logs")
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
}