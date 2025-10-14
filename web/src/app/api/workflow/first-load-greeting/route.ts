import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { runWorkflow } from "@/lib/agent/workflows/micromanager.workflow";
import { insertMessage } from "@/lib/conversations";

/**
 * Execute first-load greeting workflow
 * Sends personalized welcome message from micromanager agent
 */
export async function POST(req: NextRequest) {
  try {
    // Get token from Authorization header
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify JWT token
    const { payload } = await jwtVerify(token, env.JWT_SECRET);
    const userId = payload.sub;
    const userName = payload.name;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    console.log(`[First Load Greeting] Starting workflow for user ${userId} (${userName})`);

    // Run micromanager workflow with first-load prompt
    const result = await runWorkflow({
      input_as_text: `User "${userName}" logged in for the first time. Write a personalized introduction message as their micromanager assistant. Be warm, brief, and engaging.`,
      user_id: userId as string,
    });

    const greetingMessage = result.output_text;

    // Store the greeting message in conversation history
    await insertMessage({
      userId: userId as string,
      role: "assistant",
      content: greetingMessage,
      type: "text",
      source: "micromanager",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`[First Load Greeting] Workflow completed and message saved for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: greetingMessage,
      userId,
    });
  } catch (error) {
    console.error("[First Load Greeting] Error executing workflow:", error);
    return NextResponse.json(
      {
        error: "Failed to generate greeting",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
