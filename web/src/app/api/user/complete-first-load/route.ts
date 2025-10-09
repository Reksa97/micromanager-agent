import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getMongoClient } from "@/lib/db";

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

    const client = await getMongoClient();
    const db = client.db();

    // Mark first load as complete
    await db.collection("users").updateOne(
      { telegramId: parseInt(userId) },
      {
        $set: {
          hasCompletedFirstLoad: true,
          updatedAt: new Date(),
        },
      }
    );

    console.log(`[First Load] Completed for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "First load marked as complete",
    });
  } catch (error) {
    console.error("Error marking first load complete:", error);
    return NextResponse.json(
      { error: "Failed to mark first load complete" },
      { status: 500 }
    );
  }
}
