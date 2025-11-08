import { NextRequest, NextResponse } from "next/server";
import {
  getReadyTasks,
  lockTask,
  completeTask,
  unlockTask,
} from "@/lib/scheduled-tasks";
import { runWorkflow } from "@/lib/agent/workflows/micromanager.workflow";
import {
  sendTelegramMessage,
  getTelegramUserByUserId,
} from "@/lib/telegram/bot";
import { insertMessage } from "@/lib/conversations";
import { env } from "@/env";
import { logUsage } from "@/lib/usage-tracking";
import type { UsageLog } from "@/lib/usage-tracking";
import { MODELS } from "@/lib/utils";
import {
  getHoursSinceLastInteraction,
  calculateNudgeLevel,
  generateNudgeMessage,
  shouldNudge,
  incrementNonResponseCounter,
} from "@/lib/nudge-system";
import { getUserContextDocument } from "@/lib/user-context";
import type { StructuredUserContext } from "@/lib/agent/context-schema";

const TASK_FAILURE_MODEL = MODELS.text;

async function logTaskFailure(
  userId: string,
  taskType: UsageLog["taskType"],
  errorMessage: string
) {
  try {
    await logUsage({
      userId,
      taskType,
      source: "api",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      toolCalls: 0,
      toolNames: [],
      model: TASK_FAILURE_MODEL,
      duration: 0,
      success: false,
      error: errorMessage,
    });
  } catch (logError) {
    console.error(`[Master Cron] Failed to log ${taskType} failure:`, logError);
  }
}

/**
 * Master cron job that processes all scheduled tasks
 * Runs hourly via Vercel Cron
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (Vercel sets this header automatically)
    const authHeader = req.headers.get("authorization");

    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      console.error("[Master Cron] Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Master Cron] Starting scheduled task processing");

    // Get tasks ready to run
    const tasks = await getReadyTasks(50);
    console.log(`[Master Cron] Found ${tasks.length} tasks ready to run`);

    if (tasks.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No tasks to process",
      });
    }

    // Process tasks in parallel with error handling
    const results = await Promise.allSettled(
      tasks.map(async (task) => {
        const taskId = task._id!;
        console.log(
          `[Master Cron] Processing task ${taskId} (${task.taskType})`
        );

        // Try to acquire lock
        const locked = await lockTask(taskId, 5 * 60 * 1000); // 5 min lock
        if (!locked) {
          console.log(`[Master Cron] Task ${taskId} already locked, skipping`);
          return { taskId, status: "skipped", reason: "already_locked" };
        }

        try {
          // Execute based on task type
          if (task.taskType === "daily_check") {
            await executeDailyCheck(task.userId);
          } else if (task.taskType === "reminder") {
            await executeReminder(task.userId, task.payload);
          } else if (task.taskType === "nudge") {
            await executeNudge(task.userId);
          } else {
            console.warn(`[Master Cron] Unknown task type: ${task.taskType}`);
          }

          // Mark as complete (reschedules if recurring)
          await completeTask(taskId);
          console.log(`[Master Cron] Task ${taskId} completed successfully`);

          return { taskId, status: "success" };
        } catch (error) {
          console.error(`[Master Cron] Task ${taskId} failed:`, error);

          // Unlock for retry
          await unlockTask(taskId);
          if (task.userId) {
            const taskType: UsageLog["taskType"] =
              task.taskType === "daily_check" || task.taskType === "reminder"
                ? task.taskType
                : "workflow";
            await logTaskFailure(
              task.userId,
              taskType,
              error instanceof Error ? error.message : "Unknown error"
            );
          }

          return {
            taskId,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    // Count results
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "success"
    ).length;
    const failed = results.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && r.value.status === "failed")
    ).length;
    const skipped = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "skipped"
    ).length;

    console.log(
      `[Master Cron] Finished: ${succeeded} success, ${failed} failed, ${skipped} skipped`
    );

    return NextResponse.json({
      success: true,
      processed: tasks.length,
      succeeded,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("[Master Cron] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Execute daily check: run workflow and send message via Telegram
 */
async function executeDailyCheck(userId: string) {
  console.log(`[Daily Check] Starting for user ${userId}`);

  // Get user's Telegram chat
  const telegramUser = await getTelegramUserByUserId(userId);
  if (!telegramUser?.telegramChatId) {
    console.log(`[Daily Check] No Telegram chat for user ${userId}, skipping`);
    await logTaskFailure(
      userId,
      "daily_check",
      "No Telegram chat linked for daily check"
    );
    return;
  }

  // Run workflow with daily check prompt
  const workflowResult = await runWorkflow({
    input_as_text:
      "This is your daily check-in. Review and update my context and send me a brief, personalized message. Ask about my plans or offer helpful suggestions.",
    user_id: userId,
    source: "api",
    usageTaskType: "daily_check",
    model: TASK_FAILURE_MODEL,
  });

  const message = workflowResult.output_text;

  // Store assistant message
  await insertMessage({
    userId,
    role: "assistant",
    content: message,
    type: "text",
    source: "daily-check",
    telegramChatId: telegramUser.telegramChatId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Send via Telegram
  await sendTelegramMessage(telegramUser.telegramChatId, message);

  console.log(`[Daily Check] Completed for user ${userId}`);
}

/**
 * Execute reminder: send custom reminder message
 */
async function executeReminder(
  userId: string,
  payload?: Record<string, unknown>
) {
  console.log(`[Reminder] Starting for user ${userId}`, payload);

  const telegramUser = await getTelegramUserByUserId(userId);
  if (!telegramUser?.telegramChatId) {
    console.log(`[Reminder] No Telegram chat for user ${userId}, skipping`);
    await logTaskFailure(
      userId,
      "reminder",
      "No Telegram chat linked for reminder"
    );
    return;
  }

  const message = (payload?.message as string) || "Reminder!";

  // Store reminder message
  await insertMessage({
    userId,
    role: "assistant",
    content: message,
    type: "text",
    source: "reminder",
    telegramChatId: telegramUser.telegramChatId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Send via Telegram
  await sendTelegramMessage(telegramUser.telegramChatId, message);

  console.log(`[Reminder] Completed for user ${userId}`);
}

/**
 * Execute nudge: send progressive reminder if user hasn't responded
 */
async function executeNudge(userId: string) {
  console.log(`[Nudge] Starting for user ${userId}`);

  // Get Telegram user
  const telegramUser = await getTelegramUserByUserId(userId);
  if (!telegramUser?.telegramChatId) {
    console.log(`[Nudge] No Telegram chat for user ${userId}, skipping`);
    return;
  }

  // Get hours since last interaction
  const hoursSinceLastInteraction = await getHoursSinceLastInteraction(userId);
  console.log(
    `[Nudge] User ${userId} last interaction: ${hoursSinceLastInteraction.toFixed(1)}h ago`
  );

  // Get user context for active hours
  const contextDoc = await getUserContextDocument(userId);
  const context = contextDoc.data as StructuredUserContext;
  const activeHours = context?.patterns?.activeHours;

  // Check if we should nudge
  if (!shouldNudge(hoursSinceLastInteraction, activeHours)) {
    console.log(`[Nudge] User ${userId} does not need nudge yet, skipping`);
    return;
  }

  // Calculate nudge level
  const nudgeLevel = calculateNudgeLevel(hoursSinceLastInteraction);
  console.log(
    `[Nudge] User ${userId} nudge level: ${nudgeLevel.level} (${nudgeLevel.tone})`
  );

  // Generate nudge message with language support
  // TODO: Could fetch upcoming events summary from calendar
  const message = await generateNudgeMessage(nudgeLevel, userId);

  // Store nudge message
  await insertMessage({
    userId,
    role: "assistant",
    content: message,
    type: "text",
    source: "nudge",
    telegramChatId: telegramUser.telegramChatId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Send via Telegram
  await sendTelegramMessage(telegramUser.telegramChatId, message);

  // Increment non-response counter
  await incrementNonResponseCounter(userId);

  console.log(`[Nudge] Completed for user ${userId}`);
}
