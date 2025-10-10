import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getMongoClient } from "@/lib/db";

/**
 * Reset user progress for testing
 * Available in dev for all users, in production only for paid users
 * Resets XP, level, streak, and first-load status
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
    const userTier = payload.tier as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // In production, only allow paid users (paid, enterprise, admin)
    if (process.env.NODE_ENV === "production") {
      const allowedTiers = ["paid", "enterprise", "admin"];
      if (!userTier || !allowedTiers.includes(userTier)) {
        return NextResponse.json(
          { error: "This feature is only available for paid users" },
          { status: 403 }
        );
      }
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
        $unset: {
          firstLoadProgress: "",
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`[Reset Progress] Reset for user ${userId} (tier: ${userTier})`);

    return NextResponse.json({
      success: true,
      message: "Progress reset successfully",
      userId,
      tier: userTier,
    });
  } catch (error) {
    console.error("Error resetting progress:", error);
    return NextResponse.json(
      { error: "Failed to reset progress" },
      { status: 500 }
    );
  }
}
