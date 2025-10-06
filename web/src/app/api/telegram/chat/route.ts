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
import { verifyTelegramServerToken } from "@/lib/telegram/auth";

export async function POST(req: NextRequest) {
  try {
    // Verify JWT token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (!(await verifyTelegramServerToken(token))) {
      try {
        await jwtVerify(token, env.JWT_SECRET);
      } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }

    const { message, userId } = await req.json();

    if (!message || !userId) {
      return NextResponse.json(
        { error: "Message and userId are required" },
        { status: 400 }
      );
    }

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

    const model = MODELS.textBudget;
    const tools = getBackendTools(userId);

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
      response,
      newItems: agentResult.newItems,
      micromanagerAgentPrompt,
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
