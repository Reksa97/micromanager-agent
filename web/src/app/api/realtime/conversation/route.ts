import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { insertRealtimeMessages } from "@/lib/realtime-conversations";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().min(1),
  type: z.enum(["text"]).default("text"),
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
    source: "realtime-agent" as const,
    createdAt: message.createdAt ? new Date(message.createdAt) : now,
    updatedAt: now,
    metadata: message.metadata,
  }));

  await insertRealtimeMessages(messages);

  // No cross-posting to the text chat collections to keep channels separate
  return NextResponse.json({ success: true });
}
