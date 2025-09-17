import { ObjectId } from "mongodb";

import { getMongoClient } from "@/lib/db";

export interface UserContextDocument {
  _id?: ObjectId;
  userId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = "user_contexts";

async function collection() {
  const client = await getMongoClient();
  const col = client.db().collection<UserContextDocument>(COLLECTION);
  await col.createIndex({ userId: 1 }, { unique: true });
  return col;
}

function toDotPath(segments: string[]) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("Path segments must be a non-empty array");
  }
  for (const segment of segments) {
    if (typeof segment !== "string" || segment.trim().length === 0) {
      throw new Error("Each path segment must be a non-empty string");
    }
    if (segment.includes("\0")) {
      throw new Error("Path segments cannot include null bytes");
    }
  }
  return segments.join(".");
}

export async function getUserContextDocument(userId: string) {
  const col = await collection();
  const doc = await col.findOne({ userId });
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
  await col.insertOne(base);
  return base;
}

export async function setUserContextValue(userId: string, segments: string[], value: unknown) {
  const col = await collection();
  const path = toDotPath(segments);
  const now = new Date();
  await col.updateOne(
    { userId },
    {
      $set: {
        [`data.${path}`]: value,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
        data: {},
      },
    },
    { upsert: true },
  );
  return {
    path,
    updatedAt: now,
  };
}

export async function deleteUserContextValue(userId: string, segments: string[]) {
  const col = await collection();
  const path = toDotPath(segments);
  const now = new Date();
  await col.updateOne(
    { userId },
    {
      $unset: {
        [`data.${path}`]: "",
      },
      $set: { updatedAt: now },
      $setOnInsert: {
        createdAt: now,
        data: {},
      },
    },
    { upsert: true },
  );
  return {
    path,
    updatedAt: now,
  };
}

export function summarizeContextData(data: Record<string, unknown>) {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return "The user context is currently empty.";
  }
  return JSON.stringify(data, null, 2);
}

export function formatContextForPrompt(doc: UserContextDocument) {
  const summary = summarizeContextData(doc.data);
  return `User context snapshot (updated ${doc.updatedAt.toISOString()}):\n${summary}`;
}

export function formatContextForDisplay(doc: UserContextDocument) {
  const summary = summarizeContextData(doc.data);
  return {
    text: summary,
    updatedAt: doc.updatedAt,
  };
}

