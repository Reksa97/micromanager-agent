import { NextRequest, NextResponse } from "next/server";
import { scheduleDailyCheck, getUserTasks } from "@/lib/scheduled-tasks";
import { jwtVerify } from "jose";
import { env } from "@/env";

/**
 * Schedule a daily check for the authenticated user
 * GET: Get scheduled tasks for current user
 * POST: Schedule daily check for current user
 */
export async function GET(req: NextRequest) {
  try {
    // Verify JWT token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, env.JWT_SECRET);
    const userId = payload.sub;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's scheduled tasks
    const tasks = await getUserTasks(userId);

    return NextResponse.json({
      success: true,
      tasks: tasks.map((task) => ({
        id: task._id?.toString(),
        taskType: task.taskType,
        nextRunAt: task.nextRunAt,
        lastRunAt: task.lastRunAt,
        intervalMs: task.intervalMs,
      })),
    });
  } catch (error) {
    console.error("Error getting scheduled tasks:", error);
    return NextResponse.json(
      { error: "Failed to get scheduled tasks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify JWT token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, env.JWT_SECRET);
    const userId = payload.sub;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get optional hour from request body (default 9 UTC)
    const body = await req.json().catch(() => ({}));
    const hourUTC = body.hourUTC ?? 9;

    // Schedule daily check
    await scheduleDailyCheck(userId, hourUTC);

    return NextResponse.json({
      success: true,
      message: `Daily check scheduled for ${hourUTC}:00 UTC`,
    });
  } catch (error) {
    console.error("Error scheduling daily check:", error);
    return NextResponse.json(
      { error: "Failed to schedule daily check" },
      { status: 500 }
    );
  }
}
