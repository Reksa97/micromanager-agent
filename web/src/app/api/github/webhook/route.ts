/**
 * GitHub Webhook Handler
 *
 * Receives PR events from GitHub and stores them in MongoDB
 * Sends notifications to users via Telegram
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertPRFromWebhook, updatePRCheckStatus } from "@/lib/github-prs";
import { notifyTelegramUser } from "@/lib/telegram/bot";
import { env } from "@/env";
import { createHmac } from "crypto";
import {
  generateGitHubPRNotification,
  getUserLanguage,
  type GitHubPRNotification,
} from "@/lib/i18n/notifications";
import { getDb } from "@/lib/db";

// GitHub webhook event types we care about
type GitHubPRAction =
  | "opened"
  | "closed"
  | "reopened"
  | "synchronize"
  | "ready_for_review"
  | "converted_to_draft";

interface GitHubWebhookPayload {
  action: GitHubPRAction;
  pull_request: {
    number: number;
    title: string;
    state: "open" | "closed";
    html_url: string;
    head: {
      sha: string;
      ref: string;
    };
    base: {
      ref: string;
    };
    user: {
      login: string;
    };
    draft: boolean;
    merged: boolean;
  };
  repository: {
    full_name: string;
    owner: {
      login: string;
    };
  };
}

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(
  payload: string,
  signature: string | null
): boolean {
  if (!signature) {
    console.error("[GitHub Webhook] No signature provided");
    return false;
  }

  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[GitHub Webhook] No secret configured");
    return false;
  }

  const hmac = createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  // Timing-safe comparison
  return digest.length === signature.length &&
         createHmac("sha256", digest).digest().equals(
           createHmac("sha256", signature).digest()
         );
}

/**
 * Map GitHub repo to userId
 * For now, use environment variable. Later can be per-repo configuration.
 */
function getOwnerUserId(repoFullName: string): string | null {
  // For demo: map specific repo to user ID
  const repoOwnerMap: Record<string, string> = {};

  // Check env for default user
  const defaultUserId = env.GITHUB_DEFAULT_USER_ID;
  if (defaultUserId) {
    return defaultUserId;
  }

  return repoOwnerMap[repoFullName] || null;
}

export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    // Verify signature if configured
    if (env.GITHUB_WEBHOOK_SECRET) {
      if (!verifyGitHubSignature(rawBody, signature)) {
        console.error("[GitHub Webhook] Invalid signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // Parse payload
    const payload: GitHubWebhookPayload = JSON.parse(rawBody);
    const event = req.headers.get("x-github-event");

    console.log(`[GitHub Webhook] Received ${event} event:`, {
      action: payload.action,
      repo: payload.repository.full_name,
      pr: payload.pull_request?.number,
    });

    // Only handle pull_request events
    if (event !== "pull_request") {
      return NextResponse.json({ message: "Event ignored" });
    }

    // Get user ID for this repo
    const userId = getOwnerUserId(payload.repository.full_name);
    if (!userId) {
      console.log(
        `[GitHub Webhook] No user mapped for repo ${payload.repository.full_name}`
      );
      return NextResponse.json({ message: "No user mapped" });
    }

    // Check user tier - GitHub integration only for paid users
    const db = await getDb();
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ _id: userId });

    if (!user || user.tier !== "paid") {
      console.log(
        `[GitHub Webhook] User ${userId} is not on paid tier, skipping GitHub integration`
      );

      // Send WIP message to free tier users
      await notifyTelegramUser(
        userId,
        "🚧 GitHub Integration (Coming Soon)\n\n" +
        "GitHub PR notifications are currently available for paid tier users only. " +
        "We're working on enabling custom GitHub connections for all users soon!\n\n" +
        "Upgrade to paid tier to get instant notifications about your pull requests."
      ).catch(() => {
        // Ignore if user doesn't have Telegram
      });

      return NextResponse.json({
        message: "GitHub integration requires paid tier"
      });
    }

    const { pull_request: pr, action } = payload;

    // Determine PR state
    const prState = pr.merged
      ? ("merged" as const)
      : pr.state === "closed"
        ? ("closed" as const)
        : ("open" as const);

    // Upsert PR to database
    const storedPR = await upsertPRFromWebhook({
      userId,
      repoFullName: payload.repository.full_name,
      prNumber: pr.number,
      prTitle: pr.title,
      prState,
      prUrl: pr.html_url,
      headSha: pr.head.sha,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      author: pr.user.login,
      isDraft: pr.draft,
    });

    // Send Telegram notification with language support
    const language = await getUserLanguage(userId);
    const notificationData: GitHubPRNotification = {
      action: action as GitHubPRNotification["action"],
      prNumber: pr.number,
      prTitle: pr.title,
      repoFullName: payload.repository.full_name,
      author: pr.user.login,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
      prUrl: pr.html_url,
    };

    const notificationMessage = generateGitHubPRNotification(
      action,
      notificationData,
      language
    );

    if (notificationMessage) {
      await notifyTelegramUser(userId, notificationMessage);
    }

    console.log(`[GitHub Webhook] PR #${pr.number} processed successfully`);

    return NextResponse.json({
      success: true,
      prId: storedPR._id?.toString(),
      action,
    });
  } catch (error) {
    console.error("[GitHub Webhook] Error processing webhook:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle check_suite events (for PR status updates)
 */
export async function handleCheckSuite(payload: {
  action: string;
  check_suite: {
    head_sha: string;
    status: string;
    conclusion: string | null;
    pull_requests: Array<{ number: number }>;
  };
  repository: { full_name: string };
}) {
  const { check_suite, repository } = payload;

  const userId = getOwnerUserId(repository.full_name);
  if (!userId || check_suite.pull_requests.length === 0) {
    return;
  }

  // Map GitHub check status to our simplified status
  let checksStatus: "pending" | "success" | "failure" | "none" = "none";

  if (check_suite.status === "completed") {
    if (check_suite.conclusion === "success") {
      checksStatus = "success";
    } else if (
      check_suite.conclusion === "failure" ||
      check_suite.conclusion === "cancelled" ||
      check_suite.conclusion === "timed_out"
    ) {
      checksStatus = "failure";
    }
  } else if (check_suite.status === "in_progress" || check_suite.status === "queued") {
    checksStatus = "pending";
  }

  // Update all related PRs
  for (const pr of check_suite.pull_requests) {
    await updatePRCheckStatus(
      userId,
      repository.full_name,
      pr.number,
      checksStatus
    );
  }

  // Notify if checks failed
  if (checksStatus === "failure") {
    const pr = check_suite.pull_requests[0];
    await notifyTelegramUser(
      userId,
      `❌ Checks failed for PR #${pr.number} in ${repository.full_name}\n\n` +
        `Commit: \`${check_suite.head_sha.substring(0, 7)}\``
    );
  }
}

/**
 * Generate user-friendly notification message
 */
function generateNotificationMessage(
  action: string,
  pr: GitHubWebhookPayload["pull_request"],
  repoFullName: string
): string | null {
  switch (action) {
    case "opened":
      return (
        `🆕 New PR opened in ${repoFullName}\n\n` +
        `**#${pr.number}: ${pr.title}**\n` +
        `by @${pr.user.login}\n` +
        `${pr.base.ref} ← ${pr.head.ref}\n\n` +
        `[View PR](${pr.html_url})`
      );

    case "ready_for_review":
      return (
        `✅ PR ready for review in ${repoFullName}\n\n` +
        `**#${pr.number}: ${pr.title}**\n\n` +
        `[View PR](${pr.html_url})`
      );

    case "closed":
      if (pr.merged) {
        return (
          `🎉 PR merged in ${repoFullName}\n\n` +
          `**#${pr.number}: ${pr.title}**\n\n` +
          `[View PR](${pr.html_url})`
        );
      } else {
        return (
          `❌ PR closed in ${repoFullName}\n\n` +
          `**#${pr.number}: ${pr.title}**\n\n` +
          `[View PR](${pr.html_url})`
        );
      }

    case "synchronize":
      // Don't notify on every push, too noisy
      return null;

    default:
      return null;
  }
}
