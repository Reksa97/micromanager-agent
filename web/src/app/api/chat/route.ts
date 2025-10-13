import { NextResponse } from "next/server";
import { z } from "zod";

import { auth, unstable_update } from "@/auth";
import {
  insertMessage,
  getRecentMessages,
  updateMessage,
} from "@/lib/conversations";
import { notifyTelegramUser } from "@/lib/telegram/bot";
import { runWorkflow } from "@/lib/agent/workflows/micromanager.workflow";

const requestSchema = z.object({
  message: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await unstable_update({ ...session });

  const json = await request.json().catch(() => null);
  const parseResult = requestSchema.safeParse(json);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const { message: userMessage } = parseResult.data;
  const userId = session.user.id;

  let activeAssistantMessageId: string | null = null;

  try {
    let now = new Date();
    await insertMessage({
      userId,
      role: "user",
      content: userMessage,
      type: "text",
      source: "web-user",
      createdAt: now,
      updatedAt: now,
    });

    // Try to notify Telegram user about the new message
    notifyTelegramUser(
      userId,
      `💬 New message from web:\n\n${userMessage}`
    ).catch((error) => {
      console.error("Failed to send Telegram notification:", error);
    });

    now = new Date();

    activeAssistantMessageId = await insertMessage({
      userId,
      role: "assistant",
      content: "Processing...",
      type: "text",
      source: "micromanager",
      createdAt: now,
      updatedAt: now,
    });

    const workflowResult = await runWorkflow({
      input_as_text: userMessage,
      user_id: userId,
      source: "web",
      usageTaskType: "chat",
    });

    const finalContent =
      workflowResult.output_text?.trim() ?? "No final output from workflow";
    const hasError = "error" in workflowResult && workflowResult.error === true;

    await updateMessage(activeAssistantMessageId, {
      content: finalContent,
      type: "text",
      metadata: hasError ? { error: true } : undefined,
    });

    // Try to notify Telegram user about the assistant response
    notifyTelegramUser(
      userId,
      `🤖 Assistant response:\n\n${finalContent}`
    ).catch((error) => {
      console.error("Failed to send Telegram notification:", error);
    });

    return NextResponse.json({
      messageId: activeAssistantMessageId,
      content: finalContent,
    });
  } catch (error) {
    console.error("Failed to generate assistant response", error);
    const err = error instanceof Error ? error : new Error(String(error));

    if (activeAssistantMessageId) {
      await updateMessage(activeAssistantMessageId, {
        content: err.message,
        metadata: { error: err.message },
      });
    }

    return NextResponse.json(
      { error: "Unable to generate response" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await unstable_update({ ...session });

  const messages = await getRecentMessages(session.user.id, 100);
  return NextResponse.json({ messages });
}
