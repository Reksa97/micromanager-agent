import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getUserTasks, deleteScheduledTask, createScheduledTask } from "@/lib/scheduled-tasks";
import { getUserById } from "@/lib/user";

export type NotificationInterval = "15min" | "30min" | "1h" | "2h" | "4h" | "daily" | "off";

interface NotificationSettings {
  enabled: boolean;
  interval: NotificationInterval;
  timezone?: string;
  dailyHour?: number; // 0-23 UTC
}

const INTERVAL_MS: Record<NotificationInterval, number | null> = {
  "15min": 15 * 60 * 1000,
  "30min": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "daily": 24 * 60 * 60 * 1000,
  "off": null,
};

/**
 * GET - Get current notification settings
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

    // Get user's scheduled tasks
    const tasks = await getUserTasks(userId);
    const dailyCheckTask = tasks.find((t) => t.taskType === "daily_check");

    if (!dailyCheckTask) {
      return NextResponse.json({
        enabled: false,
        interval: "off" as NotificationInterval,
      });
    }

    // Determine interval from intervalMs
    let interval: NotificationInterval = "off";
    for (const [key, ms] of Object.entries(INTERVAL_MS)) {
      if (ms === dailyCheckTask.intervalMs) {
        interval = key as NotificationInterval;
        break;
      }
    }

    const settings = {
      enabled: true,
      interval,
      timezone: dailyCheckTask.payload?.timezone as string | undefined,
      dailyHour: dailyCheckTask.payload?.hour as number | undefined,
      lastRunAt: dailyCheckTask.lastRunAt?.toISOString(),
      nextRunAt: dailyCheckTask.nextRunAt?.toISOString(),
    };

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error getting notification settings:", error);
    return NextResponse.json(
      { error: "Failed to get settings" },
      { status: 500 }
    );
  }
}

/**
 * POST - Update notification settings
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { enabled, interval, timezone, dailyHour }: NotificationSettings = body;

    // Validate interval
    if (!enabled || interval === "off") {
      // Disable: delete all daily_check tasks
      const tasks = await getUserTasks(userId);
      await Promise.all(
        tasks
          .filter((t) => t.taskType === "daily_check")
          .map((t) => deleteScheduledTask(t._id!))
      );

      return NextResponse.json({
        success: true,
        message: "Notifications disabled",
      });
    }

    // Get user to check tier
    const user = await getUserById(userId);
    const userTier = user?.tier ?? "free";

    // Validate access based on tier
    if (userTier === "free" && interval !== "daily") {
      return NextResponse.json(
        { error: "Free users can only enable daily notifications" },
        { status: 403 }
      );
    }

    if (
      userTier !== "free" &&
      !["15min", "30min", "1h", "2h", "4h", "daily"].includes(interval)
    ) {
      return NextResponse.json(
        { error: "Invalid interval" },
        { status: 400 }
      );
    }

    // For daily, require timezone and hour
    if (interval === "daily") {
      if (typeof dailyHour !== "number" || dailyHour < 0 || dailyHour > 23) {
        return NextResponse.json(
          { error: "Daily notifications require valid hour (0-23 UTC)" },
          { status: 400 }
        );
      }
      if (!timezone) {
        return NextResponse.json(
          { error: "Daily notifications require timezone" },
          { status: 400 }
        );
      }
    }

    // Delete existing daily_check tasks
    const existingTasks = await getUserTasks(userId);
    await Promise.all(
      existingTasks
        .filter((t) => t.taskType === "daily_check")
        .map((t) => deleteScheduledTask(t._id!))
    );

    // Create new task
    const intervalMs = INTERVAL_MS[interval];
    if (!intervalMs) {
      return NextResponse.json(
        { error: "Invalid interval" },
        { status: 400 }
      );
    }

    // Calculate nextRunAt
    let nextRunAt = new Date();

    if (interval === "daily" && typeof dailyHour === "number") {
      // Schedule for next occurrence at specified hour UTC
      nextRunAt.setUTCHours(dailyHour, 0, 0, 0);

      // If today's time has passed, schedule for tomorrow
      if (nextRunAt <= new Date()) {
        nextRunAt.setDate(nextRunAt.getDate() + 1);
      }
    } else {
      // For other intervals, start now + interval
      nextRunAt = new Date(Date.now() + intervalMs);
    }

    const newTask = await createScheduledTask({
      userId,
      taskType: "daily_check",
      nextRunAt,
      intervalMs,
      payload: interval === "daily"
        ? { timezone, hour: dailyHour }
        : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Notification settings updated",
      nextRunAt: nextRunAt.toISOString(),
      lastRunAt: newTask.lastRunAt?.toISOString(),
      timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (error) {
    console.error("Error updating notification settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
