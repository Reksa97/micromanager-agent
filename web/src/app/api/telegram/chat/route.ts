import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { OpenAI } from "openai";
import { insertMessage, getRecentMessages } from "@/lib/conversations";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "telegram-mini-app-secret"
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    // Verify JWT token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await jwtVerify(token, JWT_SECRET);
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

    // Get recent conversation history
    const history = await getRecentMessages(userId, 10);

    // Prepare messages for GPT
    const messages = [
      {
        role: "system" as const,
        content: "You are Micromanager, a helpful AI assistant in a Telegram Mini App. Keep responses concise and mobile-friendly. Be direct and helpful.",
      },
      ...history.map(msg => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })),
    ];

    // Call GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0].message.content || "I couldn't generate a response.";

    // Store assistant response
    await insertMessage({
      userId,
      role: "assistant",
      content: aiResponse,
      type: "text",
      source: "micromanager",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ content: aiResponse });
  } catch (error) {
    console.error("Telegram chat error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}