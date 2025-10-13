import { NextRequest, NextResponse } from "next/server";
import { getGlobalLeaderboard } from "@/lib/usage-tracking";

/**
 * GET - Get global leaderboard
 *
 * Query params:
 * - limit: number of top users to return (default: 10)
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const leaderboard = await getGlobalLeaderboard(Math.min(limit, 100));

    return NextResponse.json(leaderboard);
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to get leaderboard" },
      { status: 500 }
    );
  }
}
