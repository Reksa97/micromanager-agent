import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/db";

const COLLECTION = "scheduled_tasks";

export type TaskType = "daily_check" | "reminder" | "custom";

export interface ScheduledTask {
  _id?: ObjectId;
  userId: string;
  taskType: TaskType;
  nextRunAt: Date;
  intervalMs?: number; // Recurring interval (e.g., 24 * 60 * 60 * 1000 for daily)
  payload?: Record<string, unknown>; // Custom data for the task
  lastRunAt?: Date;
  lockedUntil?: Date; // Optimistic locking to prevent duplicate execution
  createdAt: Date;
  updatedAt: Date;
}

async function getScheduledTasksCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<ScheduledTask>(COLLECTION);

  // Indexes for efficient queries
  await col.createIndex({ nextRunAt: 1 });
  await col.createIndex({ userId: 1, taskType: 1 });
  await col.createIndex({ lockedUntil: 1 }, { sparse: true });

  return col;
}

/**
 * Create a new scheduled task
 */
export async function createScheduledTask(
  task: Omit<ScheduledTask, "_id" | "createdAt" | "updatedAt">
): Promise<ScheduledTask> {
  const collection = await getScheduledTasksCollection();
  const now = new Date();

  const newTask: ScheduledTask = {
    ...task,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(newTask);
  return { ...newTask, _id: result.insertedId };
}

/**
 * Get tasks that are ready to run (not locked, nextRunAt in past)
 */
export async function getReadyTasks(limit = 50): Promise<ScheduledTask[]> {
  const collection = await getScheduledTasksCollection();
  const now = new Date();

  return collection
    .find({
      nextRunAt: { $lte: now },
      $or: [
        { lockedUntil: { $exists: false } },
        { lockedUntil: { $lte: now } },
      ],
    })
    .sort({ nextRunAt: 1 })
    .limit(limit)
    .toArray();
}

/**
 * Lock a task for execution (optimistic locking)
 * Returns true if lock acquired, false if already locked
 */
export async function lockTask(taskId: ObjectId, lockDurationMs = 5 * 60 * 1000): Promise<boolean> {
  const collection = await getScheduledTasksCollection();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockDurationMs);

  const result = await collection.updateOne(
    {
      _id: taskId,
      $or: [
        { lockedUntil: { $exists: false } },
        { lockedUntil: { $lte: now } },
      ],
    },
    {
      $set: { lockedUntil, updatedAt: now },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Update task after successful execution
 * If recurring (has intervalMs), schedules next run
 * Otherwise, deletes the task
 */
export async function completeTask(taskId: ObjectId): Promise<void> {
  const collection = await getScheduledTasksCollection();
  const task = await collection.findOne({ _id: taskId });

  if (!task) return;

  const now = new Date();

  if (task.intervalMs) {
    // Recurring task: schedule next run
    await collection.updateOne(
      { _id: taskId },
      {
        $set: {
          nextRunAt: new Date(now.getTime() + task.intervalMs),
          lastRunAt: now,
          updatedAt: now,
        },
        $unset: { lockedUntil: "" },
      }
    );
  } else {
    // One-time task: delete
    await collection.deleteOne({ _id: taskId });
  }
}

/**
 * Handle task failure - unlock for retry
 */
export async function unlockTask(taskId: ObjectId): Promise<void> {
  const collection = await getScheduledTasksCollection();
  const now = new Date();

  await collection.updateOne(
    { _id: taskId },
    {
      $unset: { lockedUntil: "" },
      $set: { updatedAt: now },
    }
  );
}

/**
 * Schedule a daily check for a user
 */
export async function scheduleDailyCheck(userId: string, hourUTC = 9): Promise<void> {
  const collection = await getScheduledTasksCollection();

  // Check if user already has a daily check scheduled
  const existing = await collection.findOne({
    userId,
    taskType: "daily_check",
  });

  if (existing) {
    console.log(`Daily check already scheduled for user ${userId}`);
    return;
  }

  // Schedule for next occurrence at specified hour UTC
  const now = new Date();
  const nextRun = new Date();
  nextRun.setUTCHours(hourUTC, 0, 0, 0);

  // If today's time has passed, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  await createScheduledTask({
    userId,
    taskType: "daily_check",
    nextRunAt: nextRun,
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
  });

  console.log(`Daily check scheduled for user ${userId} at ${nextRun.toISOString()}`);
}

/**
 * Get all scheduled tasks for a user
 */
export async function getUserTasks(userId: string): Promise<ScheduledTask[]> {
  const collection = await getScheduledTasksCollection();
  return collection.find({ userId }).sort({ nextRunAt: 1 }).toArray();
}

/**
 * Delete a scheduled task
 */
export async function deleteScheduledTask(taskId: ObjectId): Promise<void> {
  const collection = await getScheduledTasksCollection();
  await collection.deleteOne({ _id: taskId });
}
