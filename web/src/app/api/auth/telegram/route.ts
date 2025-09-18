import { NextRequest, NextResponse } from "next/server";
import { validate, parse } from "@telegram-apps/init-data-node";
import { SignJWT } from "jose";
import { getMongoClient } from "@/lib/db";
import { upsertTelegramUser } from "@/lib/telegram/bot";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "telegram-mini-app-secret"
);

interface TelegramAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export async function POST(req: NextRequest) {
  console.log("[Telegram Auth API] Received authentication request");

  try {
    const body = await req.json();
    const { initData, metadata } = body;

    console.log("[Telegram Auth API] Request metadata:", {
      hasInitData: !!initData,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : [],
    });

    if (!initData) {
      console.error("[Telegram Auth API] No init data provided in request");
      return NextResponse.json(
        { error: "Init data is required" },
        { status: 400 }
      );
    }

    // Log init data structure (without sensitive data)
    console.log("[Telegram Auth API] Init data length:", initData.length);
    console.log(
      "[Telegram Auth API] Init data preview:",
      initData.substring(0, 100) + "..."
    );

    // Validate the init data from Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error(
        "[Telegram Auth API] TELEGRAM_BOT_TOKEN is not set in environment"
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    console.log(
      "[Telegram Auth API] Bot token configured, validating init data..."
    );

    // Validate init data
    try {
      validate(initData, botToken, {
        expiresIn: 86400, // 1 day
      });
      console.log("[Telegram Auth API] Init data validation successful");
    } catch (error) {
      console.error("[Telegram Auth API] Init data validation failed:", error);
      console.error("[Telegram Auth API] Validation error details:", {
        errorMessage: error instanceof Error ? error.message : String(error),
        initDataSample: initData.substring(0, 50),
      });
      return NextResponse.json(
        { error: "Invalid or expired init data" },
        { status: 401 }
      );
    }

    // Parse the init data
    console.log("[Telegram Auth API] Parsing init data...");
    const parsedData = parse(initData);
    console.log(
      "[Telegram Auth API] Parsed data keys:",
      Object.keys(parsedData)
    );

    const user = parsedData.user as TelegramAuthUser | undefined;

    if (!user) {
      console.error(
        "[Telegram Auth API] No user data found in parsed init data"
      );
      return NextResponse.json(
        { error: "User data not found" },
        { status: 400 }
      );
    }

    console.log("[Telegram Auth API] User data extracted:", {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      isPremium: user.is_premium,
    });

    // Create or update user in MongoDB
    console.log("[Telegram Auth API] Connecting to MongoDB...");
    const client = await getMongoClient();
    const usersCollection = client.db().collection("users");

    console.log(
      "[Telegram Auth API] Looking up user with Telegram ID:",
      user.id
    );
    const existingUser = await usersCollection.findOne({
      telegramId: user.id,
    });

    let userId: string;
    let isAdmin = false;

    if (existingUser) {
      console.log("[Telegram Auth API] Existing user found:", {
        userId: existingUser._id.toString(),
        tier: existingUser.tier,
      });
      userId = existingUser._id.toString();
      isAdmin = existingUser.tier === "admin";

      // Update last login
      await usersCollection.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            lastLogin: new Date(),
            name: user.first_name
              ? `${user.first_name} ${user.last_name || ""}`.trim()
              : user.username,
          },
        }
      );
    } else {
      console.log(
        "[Telegram Auth API] No existing user found, creating new user..."
      );
      // Create new user
      const newUser = {
        telegramId: user.id,
        name: user.first_name
          ? `${user.first_name} ${user.last_name || ""}`.trim()
          : user.username,
        username: user.username,
        tier: "free",
        createdAt: new Date(),
        lastLogin: new Date(),
      };

      console.log("[Telegram Auth API] Creating new user with data:", {
        telegramId: newUser.telegramId,
        name: newUser.name,
        username: newUser.username,
      });

      const result = await usersCollection.insertOne(newUser);
      userId = result.insertedId.toString();
      console.log("[Telegram Auth API] New user created with ID:", userId);
    }

    // Store Telegram user data
    await upsertTelegramUser({
      telegramId: user.id,
      userId,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      chatId: user.id,
      isActive: true,
    });

    // Generate JWT token
    const token = await new SignJWT({
      sub: userId,
      telegramId: user.id,
      name: user.first_name || user.username || "User",
      tier: isAdmin ? "admin" : "free",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    // Set cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        telegramId: user.id,
        name: user.first_name || user.username || "User",
        tier: isAdmin ? "admin" : "free",
      },
      token,
    });

    response.cookies.set("telegram-auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    console.log("[Telegram Auth API] Authentication completed successfully");

    return response;
  } catch (error) {
    console.error(
      "[Telegram Auth API] Unexpected error during authentication:",
      error
    );
    console.error(
      "[Telegram Auth API] Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    return NextResponse.json(
      {
        error: "Authentication failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Check for token in cookie or Authorization header
  let token = req.cookies.get("telegram-auth-token")?.value;

  // Also check Authorization header
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, JWT_SECRET);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: payload.sub,
        telegramId: payload.telegramId,
        name: payload.name,
        tier: payload.tier,
      },
    });
  } catch (error) {
    console.error("[Telegram Auth GET] Token verification failed:", error);
    return NextResponse.json({ authenticated: false });
  }
}
