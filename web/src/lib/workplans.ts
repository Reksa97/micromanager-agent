import { ObjectId } from "mongodb";

import { getMongoClient } from "@/lib/db";
import {
  WORKPLAN_DEFAULT_EVENT_LIMIT,
  WORKPLAN_REFRESH_INTERVAL_MINUTES,
} from "@/lib/constants";

const COLLECTION = "workplans";

export type WorkplanEventSnapshot = {
  title: string;
  start?: string | null;
  end?: string | null;
  location?: string | null;
  description?: string | null;
};

export type WorkplanStatus = "ready" | "stale" | "error";

export interface StoredWorkplan {
  _id?: ObjectId;
  id?: string;
  userId: string;
  eventId: string;
  event: WorkplanEventSnapshot;
  steps: string[];
  status: WorkplanStatus;
  lastGeneratedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  source: "auto" | "manual";
  role: string | null;
}

export interface WorkplanWithEvent extends StoredWorkplan {
  eventStartTimestamp?: number;
}

async function getCollection() {
  const client = await getMongoClient();
  const collection = client.db().collection<StoredWorkplan>(COLLECTION);
  await collection.createIndex({ userId: 1, eventId: 1 }, { unique: true });
  await collection.createIndex({ userId: 1, "event.start": 1 });
  return collection;
}

export function normaliseEventSnapshot(event: Partial<WorkplanEventSnapshot>): WorkplanEventSnapshot {
  return {
    title: event.title ?? "Untitled event",
    start: event.start ?? null,
    end: event.end ?? null,
    location: event.location ?? null,
    description: event.description ?? null,
  };
}

export function hasEventChanged(
  existing: StoredWorkplan,
  nextEvent: WorkplanEventSnapshot
) {
  const prev = existing.event;
  return (
    prev.title !== nextEvent.title ||
    prev.start !== nextEvent.start ||
    prev.end !== nextEvent.end ||
    (prev.location ?? null) !== (nextEvent.location ?? null) ||
    (prev.description ?? null) !== (nextEvent.description ?? null)
  );
}

export function isWorkplanStale(workplan: StoredWorkplan) {
  if (workplan.source === "manual") {
    return false;
  }
  const now = Date.now();
  const ageMinutes =
    (now - new Date(workplan.lastGeneratedAt).getTime()) / (1000 * 60);
  return (
    workplan.status !== "ready" ||
    ageMinutes >= WORKPLAN_REFRESH_INTERVAL_MINUTES
  );
}

export async function findWorkplan(userId: string, eventId: string) {
  const collection = await getCollection();
  return collection.findOne({ userId, eventId });
}

export async function listWorkplans(
  userId: string,
  limit: number = WORKPLAN_DEFAULT_EVENT_LIMIT
) {
  const collection = await getCollection();
  return collection
    .find({ userId })
    .sort({ "event.start": 1, createdAt: 1 })
    .limit(limit)
    .toArray();
}

export async function saveWorkplan(
  userId: string,
  eventId: string,
  event: WorkplanEventSnapshot,
  steps: string[],
  status: WorkplanStatus = "ready",
  source: "auto" | "manual" = "auto",
  role: string | null = null
): Promise<StoredWorkplan> {
  const collection = await getCollection();
  const now = new Date();
  const update = {
    userId,
    eventId,
    event,
    steps,
    status,
    source,
    role,
    lastGeneratedAt: now,
    updatedAt: now,
  };

  const saved = await collection.findOneAndUpdate(
    { userId, eventId },
    {
      $setOnInsert: { createdAt: now },
      $set: update,
    },
    { upsert: true, returnDocument: "after" }
  );

  const savedDoc =
    saved && "value" in saved ? (saved.value as StoredWorkplan | null) : (saved as StoredWorkplan | null);

  if (!savedDoc) {
    return {
      ...update,
      createdAt: now,
      role: role ?? null,
    };
  }

  return {
    ...savedDoc,
    id: savedDoc._id?.toString() ?? savedDoc.id,
    role: savedDoc.role ?? role ?? null,
  };
}

export async function markWorkplanStatus(
  userId: string,
  eventId: string,
  status: WorkplanStatus
) {
  const collection = await getCollection();
  await collection.updateOne(
    { userId, eventId },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    }
  );
}
