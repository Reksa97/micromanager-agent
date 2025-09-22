import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { insertMessages, type MessageSource } from "@/lib/conversations";
import { notifyTelegramUser } from "@/lib/telegram/bot";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().min(1),
  type: z.enum(["text"]).default("text"),
  source: z
    .enum(["telegram-user", "web-user", "micromanager", "realtime-agent"])
    .optional(),
  createdAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parseResult = bodySchema.safeParse(json);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const now = new Date();
  const userId = session.user.id;

  const messages = parseResult.data.messages.map((message) => ({
    userId,
    role: message.role,
    content: message.content,
    type: message.type,
    source: (message.source || "realtime-agent") as MessageSource,
    createdAt: message.createdAt ? new Date(message.createdAt) : now,
    updatedAt: now,
    metadata: message.metadata,
  }));

  await insertMessages(messages);

  // Try to notify Telegram user about realtime agent messages
  for (const message of parseResult.data.messages) {
    if (message.role === "user") {
      notifyTelegramUser(
        userId,
        `🎤 Voice message from web:\n\n${message.content}`
      ).catch((error) => {
        console.error("Failed to send Telegram notification:", error);
      });
    } else if (message.role === "assistant") {
      notifyTelegramUser(
        userId,
        `🤖 Assistant response:\n\n${message.content}`
      ).catch((error) => {
        console.error("Failed to send Telegram notification:", error);
      });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lazy load to avoid circular
  const { deleteConversation } = await import("@/lib/conversations");
  await deleteConversation(session.user.id);

  return NextResponse.json({ success: true });
}
