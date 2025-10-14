import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getUserUsageStats, getUserRank } from "@/lib/usage-tracking";

/**
 * GET - Get current user's usage statistics
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, env.JWT_SECRET);
    const userId = payload.sub;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get usage stats and rank in parallel
    const [stats, rank] = await Promise.all([
      getUserUsageStats(userId),
      getUserRank(userId),
    ]);

    return NextResponse.json({
      ...stats,
      rank: rank || null,
    });
  } catch (error) {
    console.error("Error getting user stats:", error);
    return NextResponse.json(
      { error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
