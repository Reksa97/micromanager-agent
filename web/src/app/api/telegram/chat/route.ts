import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { insertMessage, getRecentMessages } from "@/lib/conversations";
import { env } from "@/env";
import { MODELS } from "@/lib/utils";
import { OpenAIAgent, runOpenAIAgent } from "@/lib/openai";
import {
  formatMicromanagerChatPrompt,
  MICROMANAGER_CHAT_SYSTEM_PROMPT,
} from "@/lib/agent/prompts";
import { getUserContextDocument } from "@/lib/user-context";
import { getBackendTools } from "@/lib/agent/tools.server";
import { getUserById } from "@/lib/user";
import { verifyTelegramServerToken } from "@/lib/telegram/auth";

export async function POST(req: NextRequest) {
  try {
    // Verify JWT token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token || !(await verifyTelegramServerToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await jwtVerify(token, env.JWT_SECRET);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { message, userId } = await req.json();

    if (!message || !userId) {
      return NextResponse.json(
        { error: "Message and userId are required" },
        { status: 400 }
      );
    }

    const user = await getUserById(userId);
    const userTier = user?.tier;

    // Store user message
    await insertMessage({
      userId,
      role: "user",
      content: message,
      type: "text",
      source: "telegram-user",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [userMessageHistory, userContextDoc] = await Promise.all([
      getRecentMessages(userId, 3),
      getUserContextDocument(userId),
    ]);

    const model = userTier === "paid" ? MODELS.text : MODELS.textBudget;
    const tools = getBackendTools(userId, undefined);

    console.log("Calling agent", { userId, userTier, model });

    const agent = new OpenAIAgent({
      name: "micromanager",
      instructions: MICROMANAGER_CHAT_SYSTEM_PROMPT,
      model,
      tools,
    });

    const micromanagerAgentPrompt = formatMicromanagerChatPrompt({
      userContextDoc: userContextDoc,
      userMessageHistory: userMessageHistory,
      userMessage: message,
    });

    const agentResult = await runOpenAIAgent(agent, micromanagerAgentPrompt);

    const response = agentResult.finalOutput ?? "No final output from agent";

    console.log("Telegram Agent result", {
      model,
      micromanagerAgentPrompt,
      response:
        response.length > 100 ? response.slice(0, 100) + "..." : response,
      newItems: agentResult.newItems.map(
        (item) => `${item.type}: ${JSON.stringify(item.rawItem.providerData)}`
      ),
    });

    // Store assistant response
    await insertMessage({
      userId,
      role: "assistant",
      content: response,
      type: "text",
      source: "micromanager",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      response,
    });
  } catch (error) {
    console.error("Telegram chat error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
