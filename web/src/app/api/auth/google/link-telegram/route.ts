import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMongoClient } from "@/lib/db";
import { ObjectId } from "mongodb";

/**
 * Link Google account to Telegram user
 * Moves the Google OAuth account from Google-user to Telegram-user
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

    const client = await getMongoClient();
    const db = client.db();

    // 1. Find the Telegram user
    const telegramUser = await db.collection("users").findOne({
      telegramId: telegramId,
    });

    if (!telegramUser) {
      return NextResponse.json(
        { error: "Telegram user not found" },
        { status: 404 }
      );
    }

    // 2. Find the Google-authenticated user (current session user)
    const googleUser = await db.collection("users").findOne({
      email: session.user.email,
    });

    if (!googleUser) {
      return NextResponse.json(
        { error: "Google user not found" },
        { status: 404 }
      );
    }

    // 3. Find the Google OAuth account
    const googleAccount = await db.collection("accounts").findOne({
      userId: googleUser._id.toString(),
      provider: "google",
    });

    if (!googleAccount) {
      return NextResponse.json(
        { error: "No Google account found. Please sign in with Google first." },
        { status: 404 }
      );
    }

    const telegramUserId = telegramUser._id.toString();

    // 4. Check if Telegram user already has a Google account linked
    const existingLink = await db.collection("accounts").findOne({
      userId: telegramUserId,
      provider: "google",
    });

    if (existingLink) {
      return NextResponse.json(
        { error: "This Telegram user already has a Google account linked" },
        { status: 400 }
      );
    }

    // 5. Move the Google account to the Telegram user
    await db.collection("accounts").updateOne(
      { _id: googleAccount._id },
      {
        $set: {
          userId: telegramUserId,
          updatedAt: new Date(),
        },
      }
    );

    // 6. Update Telegram user with email
    await db.collection("users").updateOne(
      { _id: new ObjectId(telegramUserId) },
      {
        $set: {
          email: session.user.email,
          updatedAt: new Date(),
        },
      }
    );

    console.log(`[Link Telegram] Successfully linked Google account ${session.user.email} to Telegram user ${telegramId}`);

    return NextResponse.json({
      success: true,
      message: "Google account successfully linked to Telegram user",
      telegramUser: {
        name: telegramUser.name,
        telegramId: telegramUser.telegramId,
      },
    });
  } catch (error) {
    console.error("[Link Telegram] Error:", error);
    return NextResponse.json(
      { error: "Failed to link accounts" },
      { status: 500 }
    );
  }
}
