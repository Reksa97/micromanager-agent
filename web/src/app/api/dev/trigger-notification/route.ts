import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import {
  getTelegramUserByUserId,
  sendTelegramMessage,
} from "@/lib/telegram/bot";
import { runWorkflow } from "@/lib/agent/workflows/micromanager.workflow";
import { logUsage } from "@/lib/usage-tracking";
import { MODELS } from "@/lib/utils";

const NOTIFICATION_MODEL = MODELS.text;

async function logNotificationFailure(
  userId: string,
  errorMessage: string,
  model: string = NOTIFICATION_MODEL
) {
  try {
    console.log("Logging notification failure:", {
      userId,
      errorMessage,
    });
    await logUsage({
      userId,
      taskType: "notification",
      source: "web",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      toolCalls: 0,
      toolNames: [],
      model,
      duration: 0,
      success: false,
      error: errorMessage,
    });
  } catch (logError) {
    console.error("Failed to log notification failure:", logError);
  }
}

/**
 * POST - Trigger an immediate notification for testing
 *
 * This endpoint bypasses the scheduler and immediately sends a proactive message
 * to the user. Useful for testing notification settings during development.
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let workflowAttempted = false;
  let workflowCompleted = false;

  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, env.JWT_SECRET);
    userId = payload.sub ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's Telegram info
    const telegramUser = await getTelegramUserByUserId(userId);
    console.log("Telegram user", { userId, telegramUser });
    if (!telegramUser || !telegramUser.telegramChatId) {
      await logNotificationFailure(
        userId,
        "Telegram account not linked for proactive notification",
        NOTIFICATION_MODEL
      );
      return NextResponse.json(
        { error: "Telegram account not linked" },
        { status: 404 }
      );
    }

    // Run workflow to generate proactive message
    workflowAttempted = true;
    const workflowResult = await runWorkflow({
      input_as_text:
        "This is a test notification triggered by the user. Review my context and send me a brief, personalized message.",
      user_id: userId,
      source: "web",
      usageTaskType: "notification",
      model: NOTIFICATION_MODEL,
    });
    workflowCompleted = true;

    // Send message
    await sendTelegramMessage(
      telegramUser.telegramChatId,
      workflowResult.output_text
    );

    return NextResponse.json({
      success: true,
      message: "Test notification sent",
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error triggering notification:", error);

    if (userId && (!workflowAttempted || workflowCompleted)) {
      await logNotificationFailure(
        userId,
        error instanceof Error ? error.message : "Unknown error"
      );
    }

    return NextResponse.json(
      { error: "Failed to trigger notification" },
      { status: 500 }
    );
  }
}
