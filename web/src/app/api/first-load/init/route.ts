import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { runFirstLoadTasks } from "@/lib/first-load-progress";

/**
 * Initialize first-load experience
 * Runs tasks synchronously (~5s) to ensure completion in serverless
 * Frontend polls /api/first-load/status for real-time UI updates
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

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Run first-load tasks synchronously (must await in serverless!)
    // Serverless functions terminate after response, so we MUST await
    await runFirstLoadTasks(userId);

    console.log(`[First Load] Completed for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "First-load tasks completed",
      userId,
    });
  } catch (error) {
    console.error("Error initiating first-load:", error);
    return NextResponse.json(
      { error: "Failed to initiate first-load" },
      { status: 500 }
    );
  }
}
