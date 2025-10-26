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

    console.log("[Link Telegram] Session:", {
      authenticated: !!session?.user,
      email: session?.user?.email,
      userId: session?.user?.id,
      name: session?.user?.name,
    });

    if (!session?.user?.email) {
      console.error("[Link Telegram] Not authenticated - no session or email");
      return NextResponse.json(
        { error: "Not authenticated with Google" },
        { status: 401 }
      );
    }

    const { telegramId } = await req.json();

    console.log("[Link Telegram] Request:", { telegramId, type: typeof telegramId });

    if (!telegramId || typeof telegramId !== "number") {
      console.error("[Link Telegram] Invalid telegramId:", telegramId);
      return NextResponse.json(
        { error: "Valid Telegram ID is required" },
        { status: 400 }
      );
    }

    const client = await getMongoClient();
    const db = client.db();

    // 1. Find the Telegram user
    console.log("[Link Telegram] Step 1: Finding Telegram user with ID:", telegramId);
    const telegramUser = await db.collection("users").findOne({
      telegramId: telegramId,
    });

    console.log("[Link Telegram] Telegram user result:", {
      found: !!telegramUser,
      userId: telegramUser?._id?.toString(),
      name: telegramUser?.name,
      email: telegramUser?.email,
    });

    if (!telegramUser) {
      console.error("[Link Telegram] Telegram user not found:", telegramId);
      return NextResponse.json(
        { error: "Telegram user not found" },
        { status: 404 }
      );
    }

    // 2. Find the Google-authenticated user (current session user)
    console.log("[Link Telegram] Step 2: Finding Google user with email:", session.user.email);
    const googleUser = await db.collection("users").findOne({
      email: session.user.email,
    });

    console.log("[Link Telegram] Google user result:", {
      found: !!googleUser,
      userId: googleUser?._id?.toString(),
      email: googleUser?.email,
      name: googleUser?.name,
    });

    if (!googleUser) {
      console.error("[Link Telegram] Google user not found for email:", session.user.email);
      return NextResponse.json(
        { error: "Google user not found" },
        { status: 404 }
      );
    }

    // 3. Find the Google OAuth account
    const googleUserIdStr = googleUser._id.toString();
    console.log("[Link Telegram] Step 3: Finding Google account for userId:", googleUserIdStr);

    // NextAuth MongoDB adapter stores userId as ObjectId
    // Source: https://github.com/nextauthjs/next-auth/blob/main/packages/adapter-mongodb/src/index.ts
    const googleAccount = await db.collection("accounts").findOne({
      userId: new ObjectId(googleUserIdStr),
      provider: "google",
    });

    console.log("[Link Telegram] Google account result:", {
      found: !!googleAccount,
      accountId: googleAccount?._id?.toString(),
      userId: googleAccount?.userId,
      userIdType: typeof googleAccount?.userId,
      provider: googleAccount?.provider,
      hasRefreshToken: !!googleAccount?.refresh_token,
    });

    if (!googleAccount) {
      console.error("[Link Telegram] No Google account found for user:", {
        userId: googleUserIdStr,
        email: session.user.email,
      });

      return NextResponse.json(
        { error: "No Google account found. Please sign in with Google first." },
        { status: 404 }
      );
    }

    const telegramUserId = telegramUser._id.toString();

    // 4. Check if Telegram user already has a Google account linked
    console.log("[Link Telegram] Step 4: Checking for existing Google link on Telegram user:", telegramUserId);
    const existingLink = await db.collection("accounts").findOne({
      userId: new ObjectId(telegramUserId),
      provider: "google",
    });

    console.log("[Link Telegram] Existing link check:", {
      hasExistingLink: !!existingLink,
      existingLinkId: existingLink?._id?.toString(),
    });

    if (existingLink) {
      console.error("[Link Telegram] Telegram user already has Google account linked:", {
        telegramUserId,
        existingAccountId: existingLink._id.toString(),
      });
      return NextResponse.json(
        { error: "This Telegram user already has a Google account linked" },
        { status: 400 }
      );
    }

    // 5. Remove email from Google user (to avoid unique constraint violation)
    console.log("[Link Telegram] Step 5: Removing email from Google user to avoid duplicate:", googleUserIdStr);
    const googleUserUpdateResult = await db.collection("users").updateOne(
      { _id: new ObjectId(googleUserIdStr) },
      {
        $unset: {
          email: "",
        },
        $set: {
          updatedAt: new Date(),
        },
      }
    );

    console.log("[Link Telegram] Google user email removal result:", {
      matched: googleUserUpdateResult.matchedCount,
      modified: googleUserUpdateResult.modifiedCount,
    });

    // 6. Move the Google account to the Telegram user
    console.log("[Link Telegram] Step 6: Moving Google account from user", googleUserIdStr, "to", telegramUserId);
    const updateResult = await db.collection("accounts").updateOne(
      { _id: googleAccount._id },
      {
        $set: {
          userId: new ObjectId(telegramUserId),
          updatedAt: new Date(),
        },
      }
    );

    console.log("[Link Telegram] Account update result:", {
      matched: updateResult.matchedCount,
      modified: updateResult.modifiedCount,
    });

    // 7. Update Telegram user with email (only if current email is a fallback)
    console.log("[Link Telegram] Step 7: Updating Telegram user with email:", {
      currentEmail: telegramUser.email,
      newEmail: session.user.email,
    });

    // Only replace fallback emails (username or @telegram.local), not real email addresses
    const shouldUpdateEmail =
      !telegramUser.email ||
      telegramUser.email === telegramUser.username ||
      telegramUser.email?.includes("@telegram.local");

    const userUpdate: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (shouldUpdateEmail) {
      userUpdate.email = session.user.email;
      console.log("[Link Telegram] Will update email from fallback to Google email");
    } else {
      console.log("[Link Telegram] Keeping existing email (not a fallback):", telegramUser.email);
    }

    const userUpdateResult = await db.collection("users").updateOne(
      { _id: new ObjectId(telegramUserId) },
      { $set: userUpdate }
    );

    console.log("[Link Telegram] User update result:", {
      matched: userUpdateResult.matchedCount,
      modified: userUpdateResult.modifiedCount,
      emailUpdated: shouldUpdateEmail,
    });

    console.log(`[Link Telegram] ✅ Successfully linked Google account ${session.user.email} to Telegram user ${telegramId}`);

    return NextResponse.json({
      success: true,
      message: "Google account successfully linked to Telegram user",
      telegramUser: {
        name: telegramUser.name,
        telegramId: telegramUser.telegramId,
      },
    });
  } catch (error) {
    console.error("[Link Telegram] ❌ Unexpected error:", error);
    console.error("[Link Telegram] Error stack:", error instanceof Error ? error.stack : "No stack");
    return NextResponse.json(
      { error: "Failed to link accounts" },
      { status: 500 }
    );
  }
}
