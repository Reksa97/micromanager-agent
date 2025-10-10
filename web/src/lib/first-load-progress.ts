/**
 * MongoDB-backed progress tracker for first-load experience
 * Persists progress to database for reliability across serverless instances
 */

import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/db";

export type FirstLoadStep = "analyzing" | "generating" | "checking" | "ready" | "complete";

export interface ProgressState {
  currentStep: FirstLoadStep;
  completedSteps: FirstLoadStep[];
  startedAt: number;
  userId: string;
}

export async function initProgress(userId: string): Promise<void> {
  const client = await getMongoClient();
  const db = client.db();

  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        firstLoadProgress: {
          currentStep: "analyzing",
          completedSteps: [],
          startedAt: Date.now(),
        },
        updatedAt: new Date(),
      },
    }
  );
}

export async function updateProgress(userId: string, step: FirstLoadStep): Promise<void> {
  const client = await getMongoClient();
  const db = client.db();

  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user?.firstLoadProgress) return;

  const completedSteps = user.firstLoadProgress.completedSteps || [];
  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        "firstLoadProgress.currentStep": step,
        "firstLoadProgress.completedSteps": completedSteps,
        updatedAt: new Date(),
      },
    }
  );
}

export async function getProgress(userId: string): Promise<ProgressState | null> {
  const client = await getMongoClient();
  const db = client.db();

  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user?.firstLoadProgress) return null;

  return {
    currentStep: user.firstLoadProgress.currentStep,
    completedSteps: user.firstLoadProgress.completedSteps || [],
    startedAt: user.firstLoadProgress.startedAt,
    userId,
  };
}

export async function completeProgress(userId: string): Promise<void> {
  const client = await getMongoClient();
  const db = client.db();

  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        "firstLoadProgress.currentStep": "complete",
        // Only include the 4 visual steps (not "complete" itself)
        "firstLoadProgress.completedSteps": ["analyzing", "generating", "checking", "ready"],
        hasCompletedFirstLoad: true,
        updatedAt: new Date(),
      },
    }
  );
}

export async function clearProgress(userId: string): Promise<void> {
  const client = await getMongoClient();
  const db = client.db();

  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    {
      $unset: {
        firstLoadProgress: "",
      },
      $set: {
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Simulate first-load tasks with MongoDB persistence
 * In real implementation, this would:
 * - Analyze user profile from DB
 * - Generate personalized greeting with AI
 * - Check integration status (Google Calendar, etc.)
 * - Set up workspace/context
 */
export async function runFirstLoadTasks(userId: string): Promise<void> {
  await initProgress(userId);

  // Step 1: Analyzing profile (1s)
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await updateProgress(userId, "analyzing");

  // Step 2: Generating greeting (1.2s)
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await updateProgress(userId, "generating");

  // Step 3: Checking integrations (1s)
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await updateProgress(userId, "checking");

  // Step 4: Setting up workspace (1s)
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await updateProgress(userId, "ready");

  // Step 5: Complete (0.5s)
  await new Promise((resolve) => setTimeout(resolve, 500));
  await completeProgress(userId);

  console.log(`[First Load] Completed for user ${userId}`);
}
