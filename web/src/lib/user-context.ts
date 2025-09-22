import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/db";

const COLLECTION = "user_contexts";

export interface UserContextDocument {
  _id?: ObjectId;
  userId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

async function getUserContextCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<UserContextDocument>(COLLECTION);
  await col.createIndex({ userId: 1 }, { unique: true });
  return col;
}

export async function getUserContextDocument(userId: string) {
  const collection = await getUserContextCollection();
  const doc = await collection.findOne({ userId });
  if (doc) {
    return doc;
  }
  const now = new Date();
  const base: UserContextDocument = {
    userId,
    data: {},
    createdAt: now,
    updatedAt: now,
  };
  await collection.insertOne(base);
  return base;
}

export async function updateUserContextDocument(
  userId: string,
  contextUpdates: { path: string; value?: unknown }[]
) {
  const collection = await getUserContextCollection();
  const doc = await collection.findOneAndUpdate(
    { userId },
    {
      $set: {
        data: contextUpdates.reduce((acc, update) => {
          acc[update.path] = update.value;
          if (update.value === undefined) {
            acc[update.path] = null;
          }
          return acc;
        }, {} as Record<string, unknown>),
      },
    },
    { returnDocument: "after" }
  );
  if (!doc) {
    throw new Error("Failed to update user context document");
  }
  return doc;
}
