import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { ObjectId } from "mongodb";

import { env } from "@/env";
import { getMongoClient } from "@/lib/db";
import { auth } from "@/auth";

/**
 * Convert Next-Auth Session to Telegram Mini App JWT
 *
 * This endpoint bridges next-auth authentication to the Telegram mini app interface.
 * It allows any registered user to test the Telegram mini app without actual Telegram auth.
 *
 * Flow:
 * 1. User authenticates via next-auth (email/password or Google)
 * 2. This endpoint generates a fake telegramId if user doesn't have one
 * 3. Returns JWT token compatible with Telegram mini app
 * 4. User can access /telegram-app with the token
 *
 * Usage:
 * POST /api/dev/test-login/convert-session
 * (Requires authenticated next-auth session)
 *
 * Returns: { token: "jwt-token", user: {...} }
 */
export async function POST(_req: NextRequest) {
  try {
    // Get authenticated session
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Not authenticated. Please sign in first." },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    console.log("[Test Login Convert] Converting session for user:", userId);

    // Get user from database
    const client = await getMongoClient();
    const usersCollection = client.db().collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    let telegramId = user.telegramId as number | undefined;

    // If user doesn't have telegramId, generate a fake one
    if (!telegramId) {
      // Generate fake telegramId: 900000000 + last 8 digits of ObjectId as number
      // This ensures uniqueness and is clearly a test ID (starts with 900)
      const objectIdStr = userId.toString();
      const hash = parseInt(objectIdStr.slice(-8), 16) % 100000000;
      telegramId = 900000000 + hash;

      // Update user with fake telegramId
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            telegramId,
            lastLogin: new Date()
          }
        }
      );

      console.log("[Test Login Convert] Assigned fake telegramId:", {
        userId,
        telegramId,
      });
    } else {
      // Update last login
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { lastLogin: new Date() } }
      );

      console.log("[Test Login Convert] Using existing telegramId:", {
        userId,
        telegramId,
      });
    }

    // Generate JWT token compatible with Telegram mini app
    const token = await new SignJWT({
      sub: userId,
      telegramId,
      name: user.name || session.user.name || "User",
      tier: user.tier || session.user.tier || "free",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(env.JWT_SECRET);

    console.log("[Test Login Convert] Token generated successfully:", {
      userId,
      telegramId,
      tier: user.tier,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: userId,
        telegramId,
        name: user.name || session.user.name || "User",
        tier: user.tier || "free",
      },
    });
  } catch (error) {
    console.error("[Test Login Convert] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to convert session",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    error: "Use POST method after authenticating via next-auth",
    usage: {
      method: "POST",
      authentication: "Requires active next-auth session",
      flow: [
        "1. Sign in at /login or /test-login",
        "2. Call POST /api/dev/test-login/convert-session",
        "3. Store returned token in localStorage",
        "4. Navigate to /telegram-app",
      ],
    },
  }, { status: 400 });
}
