import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getMongoClient } from "@/lib/db";

/**
 * DEV ONLY: Reset user progress for testing
 * Resets XP, level, streak, and first-load status
 */
export async function POST(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 }
    );
  }

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

    const client = await getMongoClient();
    const db = client.db();

    // Reset user progress
    const result = await db.collection("users").updateOne(
      { telegramId: parseInt(userId) },
      {
        $set: {
          level: 1,
          xp: 0,
          streak: 0,
          contextScore: 0,
          unlockedFeatures: [],
          lastCheckIn: null,
          hasCompletedFirstLoad: false,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`[DEV] Reset progress for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "Progress reset successfully",
      userId,
    });
  } catch (error) {
    console.error("Error resetting progress:", error);
    return NextResponse.json(
      { error: "Failed to reset progress" },
      { status: 500 }
    );
  }
}
