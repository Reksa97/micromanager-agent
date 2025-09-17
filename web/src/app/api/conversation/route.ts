import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { insertMessages } from "@/lib/conversations";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().min(1),
  type: z.enum(["text", "tool", "state", "audio"]).default("text"),
  createdAt: z.string().optional(),
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
      { error: "Invalid payload", details: parseResult.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const now = new Date();
  await insertMessages(
    parseResult.data.messages.map((message) => ({
      userId: session.user.id,
      role: message.role,
      content: message.content,
      type: message.type,
      createdAt: message.createdAt ? new Date(message.createdAt) : now,
      updatedAt: now,
    })),
  );

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
