import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getProgress } from "@/lib/first-load-progress";

/**
 * Get current first-load progress status
 * Frontend polls this endpoint to track progress
 */
export async function GET(req: NextRequest) {
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

    // Get progress from MongoDB
    const progress = await getProgress(userId);

    if (!progress) {
      return NextResponse.json({
        currentStep: null,
        completedSteps: [],
        isComplete: false,
      });
    }

    return NextResponse.json({
      currentStep: progress.currentStep,
      completedSteps: progress.completedSteps,
      isComplete: progress.currentStep === "complete",
      elapsedTime: Date.now() - progress.startedAt,
    });
  } catch (error) {
    console.error("Error getting first-load status:", error);
    return NextResponse.json(
      { error: "Failed to get status" },
      { status: 500 }
    );
  }
}
