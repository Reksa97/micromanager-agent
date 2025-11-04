import { getMongoClient } from "@/lib/db";
import type { UsageLog } from "@/features/admin/components/utils";
import type { WithId } from "mongodb";

export async function getUsageLogsForUser(userId: string): Promise<WithId<UsageLog>[]> {
  const client = await getMongoClient();
  const db = client.db();

  return db.collection<UsageLog>("usage_logs")
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
}