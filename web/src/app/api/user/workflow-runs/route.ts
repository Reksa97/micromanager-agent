import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getLatestWorkflows } from "@/lib/workflow-runs";

/**
 * GET - Get user's workflow runs
 *
 * Returns:
 * - current: the currently running workflow (if any)
 * - previous: the last completed/errored workflow (if any)
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

    const workflows = await getLatestWorkflows(userId);

    return NextResponse.json(workflows);
  } catch (error) {
    console.error("Error getting workflow runs:", error);
    return NextResponse.json(
      { error: "Failed to get workflow runs" },
      { status: 500 }
    );
  }
}
