import { ObjectId } from "mongodb";

import { getMongoClient } from "@/lib/db";

export type RealtimeMessageRole = "user" | "assistant" | "system" | "tool";

export type RealtimeMessageSource = "realtime-agent";

export interface RealtimeStoredMessage {
  _id?: ObjectId;
  id?: string;
  userId: string;
  role: RealtimeMessageRole;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  type: "text";
  source?: RealtimeMessageSource;
  metadata?: Record<string, unknown>;
}

const COLLECTION = "realtime_conversation_messages";

async function collection() {
  const client = await getMongoClient();
  const col = client.db().collection<RealtimeStoredMessage>(COLLECTION);
  await col.createIndex({ userId: 1, createdAt: -1 });
  return col;
}

export async function insertRealtimeMessages(messages: RealtimeStoredMessage[]) {
  if (messages.length === 0) return [];
  const col = await collection();
  const now = new Date();
  const docs = messages.map((message) => ({
    ...message,
    createdAt: message.createdAt ?? now,
    updatedAt: message.updatedAt ?? now,
    id: message.id,
    source: message.source ?? "realtime-agent",
  }));
  const { insertedIds } = await col.insertMany(docs);
  const entries = Object.values(insertedIds);
  await Promise.all(
    entries.map((objectId) =>
      col.updateOne({ _id: objectId }, { $set: { id: objectId.toString() } })
    )
  );
  return entries.map((objectId) => objectId.toString());
}
