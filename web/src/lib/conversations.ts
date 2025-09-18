import { ObjectId } from "mongodb";

import { getMongoClient } from "@/lib/db";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessageSource =
  | "telegram-user"
  | "web-user"
  | "micromanager"
  | "realtime-agent";

export interface StoredMessage {
  _id?: ObjectId;
  id?: string;
  userId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  type: "text" | "tool" | "state" | "audio";
  source?: MessageSource;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  telegramChatId?: number | string;
}

const COLLECTION = "conversation_messages";

async function collection() {
  const client = await getMongoClient();
  const col = client.db().collection<StoredMessage>(COLLECTION);
  await col.createIndex({ userId: 1, createdAt: -1 });
  return col;
}

export async function getRecentMessages(userId: string, limit = 50) {
  const col = await collection();
  const docs = await col
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.reverse();
}

export async function insertMessage(message: StoredMessage) {
  const col = await collection();
  const doc = {
    ...message,
    createdAt: message.createdAt ?? new Date(),
    updatedAt: message.updatedAt ?? new Date(),
  };
  const { insertedId } = await col.insertOne({
    ...doc,
    id: doc.id ?? undefined,
  });
  await col.updateOne(
    { _id: insertedId },
    { $set: { id: insertedId.toString() } }
  );
  return insertedId.toString();
}

export async function insertMessages(messages: StoredMessage[]) {
  if (messages.length === 0) return [];
  const col = await collection();
  const now = new Date();
  const docs = messages.map((message) => ({
    ...message,
    createdAt: message.createdAt ?? now,
    updatedAt: message.updatedAt ?? now,
    id: message.id,
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

export async function updateMessage(
  id: string,
  update: Partial<StoredMessage>
) {
  const col = await collection();
  const next = {
    ...update,
    updatedAt: update.updatedAt ?? new Date(),
  };
  await col.updateOne({ id }, { $set: next });
}

export async function deleteConversation(userId: string) {
  const col = await collection();
  await col.deleteMany({ userId });
}
