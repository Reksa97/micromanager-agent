import { NextResponse } from "next/server";
import { z } from "zod";

import { auth, unstable_update } from "@/auth";
import {
  insertMessage,
  getRecentMessages,
  updateMessage,
} from "@/lib/conversations";
import { notifyTelegramUser } from "@/lib/telegram/bot";
import { OpenAIAgent, runOpenAIAgent } from "@/lib/openai";
import { MODELS } from "@/lib/utils";
import { getUserContextDocument } from "@/lib/user-context";
import {
  formatMicromanagerChatPrompt,
  MICROMANAGER_CHAT_SYSTEM_PROMPT,
} from "@/lib/agent/prompts";
import { getBackendTools } from "@/lib/agent/tools.server";

const requestSchema = z.object({
  message: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await unstable_update({ ...session })

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
    const [userMessageHistory, userContextDoc] = await Promise.all([
      getRecentMessages(userId, 10),
      getUserContextDocument(userId),
    ]);

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

    const model = MODELS.text;
    const tools = await getBackendTools(userId, session.googleAccessToken);
    const micromanagerAgentPrompt = formatMicromanagerChatPrompt({
      userContextDoc,
      userMessageHistory,
      userMessage,
    });

    const agent = new OpenAIAgent({
      name: "micromanager",
      instructions: MICROMANAGER_CHAT_SYSTEM_PROMPT,
      model,
      tools,
    });

    const agentResult = await runOpenAIAgent(agent, micromanagerAgentPrompt);

    console.log("Agent result", {
      model,
      newItems: agentResult.newItems,
      activeAssistantMessageId,
      micromanagerAgentPrompt,
    });

    const finalContent =
      agentResult.finalOutput?.trim() ?? "No final output from agent";
    await updateMessage(activeAssistantMessageId, {
      content: finalContent,
      type: "text",
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
  await unstable_update({ ...session })

  const messages = await getRecentMessages(session.user.id, 100);
  return NextResponse.json({ messages });
}
