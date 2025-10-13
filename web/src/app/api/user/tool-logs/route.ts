import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getRecentToolLogs, getLatestSessionId, getSessionToolLogs } from "@/lib/mcp-tool-logs";

/**
 * GET - Get user's recent MCP tool logs
 *
 * Query params:
 * - session: if provided, gets logs for that session
 * - latest: if true, gets logs for the latest session
 * - limit: number of logs to return (default: 20)
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

    const searchParams = req.nextUrl.searchParams;
    const sessionId = searchParams.get("session");
    const latest = searchParams.get("latest") === "true";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    let logs;
    let currentSessionId = sessionId;

    if (latest && !sessionId) {
      // Get latest session ID
      currentSessionId = await getLatestSessionId(userId);
    }

    if (currentSessionId) {
      // Get logs for specific session
      logs = await getSessionToolLogs(userId, currentSessionId);
    } else {
      // Get recent logs
      logs = await getRecentToolLogs(userId, limit);
    }

    return NextResponse.json({
      logs,
      sessionId: currentSessionId,
    });
  } catch (error) {
    console.error("Error getting tool logs:", error);
    return NextResponse.json(
      { error: "Failed to get tool logs" },
      { status: 500 }
    );
  }
}
