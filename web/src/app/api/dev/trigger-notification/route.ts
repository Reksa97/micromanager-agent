import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getTelegramUserByUserId, sendTelegramMessage } from "@/lib/telegram/bot";
import { runWorkflow } from "@/lib/agent/workflows/micromanager.workflow";

/**
 * POST - Trigger an immediate notification for testing
 *
 * This endpoint bypasses the scheduler and immediately sends a proactive message
 * to the user. Useful for testing notification settings during development.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, env.JWT_SECRET);
    const userId = payload.sub;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's Telegram info
    const telegramUser = await getTelegramUserByUserId(userId);
    if (!telegramUser || !telegramUser.telegramChatId) {
      return NextResponse.json(
        { error: "Telegram account not linked" },
        { status: 404 }
      );
    }

    // Run workflow to generate proactive message
    const workflowResult = await runWorkflow({
      input_as_text:
        "This is a test notification triggered by the user. Review my context and send me a brief, personalized message.",
      user_id: userId,
    });

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
    return NextResponse.json(
      { error: "Failed to trigger notification" },
      { status: 500 }
    );
  }
}
