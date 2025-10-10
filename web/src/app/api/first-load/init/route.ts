import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { runFirstLoadTasks } from "@/lib/first-load-progress";

/**
 * Initialize first-load experience
 * Starts async tasks and returns immediately
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

    // Start first-load tasks asynchronously (don't await)
    runFirstLoadTasks(userId).catch((error) => {
      console.error(`[First Load] Error for user ${userId}:`, error);
    });

    console.log(`[First Load] Initiated for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "First-load tasks started",
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
