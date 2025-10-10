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

    console.log("[Verify Telegram] Session:", {
      authenticated: !!session?.user,
      email: session?.user?.email,
      userId: session?.user?.id,
    });

    if (!session?.user?.email) {
      console.error("[Verify Telegram] Not authenticated - no session or email");
      return NextResponse.json(
        { error: "Not authenticated with Google" },
        { status: 401 }
      );
    }

    const { telegramId } = await req.json();

    console.log("[Verify Telegram] Request:", { telegramId, type: typeof telegramId });

    if (!telegramId || typeof telegramId !== "number") {
      console.error("[Verify Telegram] Invalid telegramId:", telegramId);
      return NextResponse.json(
        { error: "Valid Telegram ID is required" },
        { status: 400 }
      );
    }

    // Find the Telegram user in the database
    const client = await getMongoClient();
    const db = client.db();

    console.log("[Verify Telegram] Querying for telegramId:", telegramId);

    const telegramUser = await db.collection("users").findOne({
      telegramId: telegramId,
    });

    console.log("[Verify Telegram] Telegram user found:", {
      found: !!telegramUser,
      userId: telegramUser?._id?.toString(),
      name: telegramUser?.name,
      telegramId: telegramUser?.telegramId,
    });

    if (!telegramUser) {
      console.error("[Verify Telegram] Telegram user not found for ID:", telegramId);
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
    console.error("[Verify Telegram] Unexpected error:", error);
    console.error("[Verify Telegram] Error stack:", error instanceof Error ? error.stack : "No stack");
    return NextResponse.json(
      { error: "Failed to verify Telegram ID" },
      { status: 500 }
    );
  }
}
