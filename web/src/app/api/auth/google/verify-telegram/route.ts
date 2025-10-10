import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMongoClient } from "@/lib/db";

/**
 * Verify that a Telegram user exists in the database
 * Returns user info if found
 */
export async function POST(req: NextRequest) {
  try {
    // Check if user is authenticated with Google
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated with Google" },
        { status: 401 }
      );
    }

    const { telegramId } = await req.json();

    if (!telegramId || typeof telegramId !== "number") {
      return NextResponse.json(
        { error: "Valid Telegram ID is required" },
        { status: 400 }
      );
    }

    // Find the Telegram user in the database
    const client = await getMongoClient();
    const db = client.db();

    const telegramUser = await db.collection("users").findOne({
      telegramId: telegramId,
    });

    if (!telegramUser) {
      return NextResponse.json(
        { error: "Telegram user not found. Please make sure you've logged into the Telegram Mini App at least once." },
        { status: 404 }
      );
    }

    // Return user info for confirmation
    return NextResponse.json({
      user: {
        name: telegramUser.name || `User ${telegramId}`,
        telegramId: telegramUser.telegramId,
      },
    });
  } catch (error) {
    console.error("[Verify Telegram] Error:", error);
    return NextResponse.json(
      { error: "Failed to verify Telegram ID" },
      { status: 500 }
    );
  }
}
