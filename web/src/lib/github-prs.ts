/**
 * GitHub Pull Request Management
 *
 * Stores and manages PR state for Micromanager agent
 */

import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/db";

const COLLECTION = "github_prs";

export type PRState = "open" | "closed" | "merged";
export type PRAction = "opened" | "closed" | "reopened" | "synchronize" | "ready_for_review" | "converted_to_draft";

export interface GitHubPR {
  _id?: ObjectId;
  userId: string; // Who owns/monitors this PR

  // GitHub metadata
  repoFullName: string; // e.g., "Reksa97/micromanager-agent"
  prNumber: number;
  prTitle: string;
  prState: PRState;
  prUrl: string;

  // PR details
  headSha: string; // Latest commit SHA
  headRef: string; // Branch name
  baseRef: string; // Target branch (usually main)
  author: string; // GitHub username
  isDraft: boolean;

  // Checks & Status
  checksStatus?: "pending" | "success" | "failure" | "none";
  lastCheckRunAt?: Date;

  // Calendar integration (optional)
  calendarEventId?: string;
  releaseScheduledAt?: Date;

  // Agent context
  isTaggedForRelease?: boolean;
  releaseNotes?: string;
  lastAgentCommentId?: string; // To avoid duplicate comments

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date; // Last time we synced from GitHub
}

async function getPRCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<GitHubPR>(COLLECTION);

  // Indexes for efficient queries
  await col.createIndex({ userId: 1, repoFullName: 1, prNumber: 1 }, { unique: true });
  await col.createIndex({ userId: 1, prState: 1 });
  await col.createIndex({ isTaggedForRelease: 1, releaseScheduledAt: 1 });

  return col;
}

/**
 * Upsert PR from webhook event
 */
export async function upsertPRFromWebhook(data: {
  userId: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prState: PRState;
  prUrl: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  author: string;
  isDraft: boolean;
}): Promise<GitHubPR> {
  const collection = await getPRCollection();
  const now = new Date();

  const result = await collection.findOneAndUpdate(
    {
      userId: data.userId,
      repoFullName: data.repoFullName,
      prNumber: data.prNumber,
    },
    {
      $set: {
        ...data,
        updatedAt: now,
        lastSyncedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
    }
  );

  if (!result) {
    throw new Error("Failed to upsert PR");
  }

  return result;
}

/**
 * List PRs for a user
 */
export async function listUserPRs(
  userId: string,
  options?: {
    repoFullName?: string;
    state?: PRState;
    taggedForRelease?: boolean;
    limit?: number;
  }
): Promise<GitHubPR[]> {
  const collection = await getPRCollection();

  const query: Record<string, unknown> = { userId };

  if (options?.repoFullName) {
    query.repoFullName = options.repoFullName;
  }

  if (options?.state) {
    query.prState = options.state;
  }

  if (options?.taggedForRelease !== undefined) {
    query.isTaggedForRelease = options.taggedForRelease;
  }

  return collection
    .find(query)
    .sort({ updatedAt: -1 })
    .limit(options?.limit || 50)
    .toArray();
}

/**
 * Get a specific PR
 */
export async function getPR(
  userId: string,
  repoFullName: string,
  prNumber: number
): Promise<GitHubPR | null> {
  const collection = await getPRCollection();
  return collection.findOne({
    userId,
    repoFullName,
    prNumber,
  });
}

/**
 * Update PR check status
 */
export async function updatePRCheckStatus(
  userId: string,
  repoFullName: string,
  prNumber: number,
  checksStatus: "pending" | "success" | "failure" | "none"
): Promise<void> {
  const collection = await getPRCollection();
  const now = new Date();

  await collection.updateOne(
    { userId, repoFullName, prNumber },
    {
      $set: {
        checksStatus,
        lastCheckRunAt: now,
        updatedAt: now,
      },
    }
  );
}

/**
 * Tag PR for release
 */
export async function tagPRForRelease(
  userId: string,
  repoFullName: string,
  prNumber: number,
  options?: {
    releaseScheduledAt?: Date;
    calendarEventId?: string;
    releaseNotes?: string;
  }
): Promise<void> {
  const collection = await getPRCollection();
  const now = new Date();

  await collection.updateOne(
    { userId, repoFullName, prNumber },
    {
      $set: {
        isTaggedForRelease: true,
        releaseScheduledAt: options?.releaseScheduledAt,
        calendarEventId: options?.calendarEventId,
        releaseNotes: options?.releaseNotes,
        updatedAt: now,
      },
    }
  );
}

/**
 * Update last agent comment ID to prevent duplicates
 */
export async function updatePRLastComment(
  userId: string,
  repoFullName: string,
  prNumber: number,
  commentId: string
): Promise<void> {
  const collection = await getPRCollection();

  await collection.updateOne(
    { userId, repoFullName, prNumber },
    {
      $set: {
        lastAgentCommentId: commentId,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Get PRs scheduled for release
 */
export async function getScheduledReleases(
  beforeDate?: Date
): Promise<GitHubPR[]> {
  const collection = await getPRCollection();

  const query: Record<string, unknown> = {
    isTaggedForRelease: true,
    prState: "open",
  };

  if (beforeDate) {
    query.releaseScheduledAt = { $lte: beforeDate };
  }

  return collection
    .find(query)
    .sort({ releaseScheduledAt: 1 })
    .toArray();
}
