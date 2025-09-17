import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { insertMessage, getRecentMessages, updateMessage } from "@/lib/conversations";
import { MODELS, openai } from "@/lib/openai";

const requestSchema = z.object({
  message: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
});

const STREAM_UPDATE_INTERVAL_MS = 1_000;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parseResult = requestSchema.safeParse(json);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parseResult.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { message, temperature = 0.7 } = parseResult.data;
  const userId = session.user.id;

  const history = await getRecentMessages(userId, 20);

  const chatHistory = history
    .filter((item) => item.type === "text" && ["user", "assistant", "system"].includes(item.role))
    .map((item) => ({ role: item.role as "user" | "assistant" | "system", content: item.content }));

  const openaiMessages = [
    {
      role: "system" as const,
      content:
        "You are Micromanager, an operations-focused AI agent. Keep responses concise, actionable, and track outstanding tasks.",
    },
    ...chatHistory,
    { role: "user" as const, content: message },
  ];

  await insertMessage({
    userId,
    role: "user",
    content: message,
    type: "text",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const stream = await openai.chat.completions.create({
    model: MODELS.text,
    messages: openaiMessages,
    temperature,
    stream: true,
  });
  let assistantFullText = "";

  const assistantMessageId = await insertMessage({
    userId,
    role: "assistant",
    content: "",
    type: "text",
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: { streaming: true },
  });

  let lastFlush = Date.now();

  const flushUpdate = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlush < STREAM_UPDATE_INTERVAL_MS) {
      return;
    }

    lastFlush = now;
    try {
      await updateMessage(assistantMessageId, {
        content: assistantFullText,
        metadata: { streaming: true },
      });
    } catch (error) {
      console.error("Failed to flush assistant message", error);
    }
  };

  try {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (!content) continue;
      assistantFullText += content;
      await flushUpdate();
    }

    const finalContent = assistantFullText.trim();
    await updateMessage(assistantMessageId, {
      content: finalContent,
      metadata: { streaming: false },
    });

    return NextResponse.json({ messageId: assistantMessageId, content: finalContent });
  } catch (error) {
    console.error("Failed to generate assistant response", error);
    await updateMessage(assistantMessageId, {
      content: assistantFullText.trim() || "",
      metadata: { streaming: false, error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: "Unable to generate response" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await getRecentMessages(session.user.id, 100);
  return NextResponse.json({ messages });
}
