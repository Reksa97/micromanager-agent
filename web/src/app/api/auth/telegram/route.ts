import { NextRequest, NextResponse } from "next/server";
import { validate, parse } from "@telegram-apps/init-data-node";
import { SignJWT } from "jose";

import { env } from "@/env";
import { getMongoClient } from "@/lib/db";
import { upsertTelegramUser } from "@/lib/telegram/bot";

interface TelegramAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

type MockTelegramUserPayload = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_premium?: boolean;
  tier?: string;
  chat_id?: number | string;
  chatId?: number | string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initData, metadata } = body as {
      initData?: string;
      metadata?: Record<string, unknown>;
    };

    // Block any mock authentication attempts in production immediately
    if (process.env.NODE_ENV === "production" && (body.mockSecret || body.mockUser)) {
      console.error("[Telegram Auth API] Mock authentication attempt blocked in production");
      return NextResponse.json(
        { error: "Mock authentication is completely disabled in production" },
        { status: 403 }
      );
    }

    const mockSecret =
      typeof body.mockSecret === "string" ? body.mockSecret : undefined;
    const mockUser = (body.mockUser ?? null) as MockTelegramUserPayload | null;
    const devMockSecret = env.TELEGRAM_DEV_MOCK_SECRET;

    const isMockMode = mockSecret === devMockSecret && process.env.NODE_ENV !== "production";

    console.log("[Telegram Auth API] Received authentication request", {
      isMockMode,
      hasInitData: Boolean(initData),
      environment: process.env.NODE_ENV,
    });

    if (mockSecret && !devMockSecret) {
      return NextResponse.json(
        { error: "Mock secret is not configured on the server" },
        { status: 400 }
      );
    }

    if (mockSecret && !isMockMode) {
      return NextResponse.json(
        { error: "Invalid mock secret" },
        { status: 401 }
      );
    }

    const requestMetadata = metadata ?? {};
    console.log("[Telegram Auth API] Request metadata:", {
      hasInitData: Boolean(initData),
      hasMetadata: Object.keys(requestMetadata).length > 0,
      metadataKeys: Object.keys(requestMetadata),
      isMockMode,
    });

    let telegramUser: TelegramAuthUser | undefined;
    let requestedTier: string | undefined;
    let resolvedChatId: number;

    if (isMockMode) {
      const rawId = mockUser?.id ?? 999_000_000;
      const telegramId =
        typeof rawId === "number" ? rawId : Number.parseInt(String(rawId), 10);

      if (!Number.isFinite(telegramId)) {
        return NextResponse.json(
          { error: "Invalid mock user id" },
          { status: 400 }
        );
      }

      const rawChatId = mockUser?.chat_id ?? mockUser?.chatId ?? telegramId;
      const chatId =
        typeof rawChatId === "number"
          ? rawChatId
          : Number.parseInt(String(rawChatId), 10);

      if (!Number.isFinite(chatId)) {
        return NextResponse.json(
          { error: "Invalid mock chat id" },
          { status: 400 }
        );
      }

      telegramUser = {
        id: telegramId,
        first_name: mockUser?.first_name ?? "Dev",
        last_name: mockUser?.last_name,
        username: mockUser?.username ?? "dev_user",
        is_premium: Boolean(mockUser?.is_premium),
      };

      const tierCandidate =
        typeof mockUser?.tier === "string"
          ? mockUser.tier.toLowerCase()
          : undefined;
      if (tierCandidate && ["free", "paid", "admin"].includes(tierCandidate)) {
        requestedTier = tierCandidate;
      }

      resolvedChatId = chatId;

      console.log("[Telegram Auth API] Mock authentication enabled", {
        telegramId,
        chatId,
        requestedTier,
        username: telegramUser.username,
      });
    } else {
      if (!initData) {
        console.error("[Telegram Auth API] No init data provided in request");
        return NextResponse.json(
          { error: "Init data is required" },
          { status: 400 }
        );
      }

      console.log("[Telegram Auth API] Init data length:", initData.length);
      console.log(
        "[Telegram Auth API] Init data preview:",
        initData.substring(0, 100) + "..."
      );

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

      try {
        validate(initData, botToken, {
          expiresIn: 86400, // 1 day
        });
        console.log("[Telegram Auth API] Init data validation successful");
      } catch (error) {
        console.error(
          "[Telegram Auth API] Init data validation failed:",
          error
        );
        console.error("[Telegram Auth API] Validation error details:", {
          errorMessage: error instanceof Error ? error.message : String(error),
          initDataSample: initData.substring(0, 50),
        });
        return NextResponse.json(
          { error: "Invalid or expired init data" },
          { status: 401 }
        );
      }

      console.log("[Telegram Auth API] Parsing init data...");
      const parsedData = parse(initData);
      console.log(
        "[Telegram Auth API] Parsed data keys:",
        Object.keys(parsedData)
      );

      telegramUser = parsedData.user as TelegramAuthUser | undefined;

      if (!telegramUser) {
        console.error(
          "[Telegram Auth API] No user data found in parsed init data"
        );
        return NextResponse.json(
          { error: "User data not found" },
          { status: 400 }
        );
      }

      resolvedChatId = telegramUser.id;

      console.log("[Telegram Auth API] User data extracted:", {
        id: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        isPremium: telegramUser.is_premium,
      });
    }

    if (!telegramUser) {
      console.error("[Telegram Auth API] Failed to resolve Telegram user data");
      return NextResponse.json(
        { error: "Unable to resolve Telegram user" },
        { status: 400 }
      );
    }

    console.log("[Telegram Auth API] Connecting to MongoDB...");
    const client = await getMongoClient();
    const usersCollection = client.db().collection("users");

    console.log(
      "[Telegram Auth API] Looking up user with Telegram ID:",
      telegramUser.id
    );
    const existingUser = await usersCollection.findOne({
      telegramId: telegramUser.id,
    });

    let userId: string;
    let userTier: string;

    if (existingUser) {
      userId = existingUser._id.toString();
      userTier = existingUser.tier ?? "free";

      console.log("[Telegram Auth API] Existing user found:", {
        userId,
        tier: userTier,
      });

      if (requestedTier && requestedTier !== userTier) {
        await usersCollection.updateOne(
          { _id: existingUser._id },
          { $set: { tier: requestedTier } }
        );
        userTier = requestedTier;
        console.log("[Telegram Auth API] Updated user tier:", {
          userId,
          userTier,
        });
      }

      await usersCollection.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            lastLogin: new Date(),
            name: telegramUser.first_name
              ? `${telegramUser.first_name} ${
                  telegramUser.last_name || ""
                }`.trim()
              : telegramUser.username,
          },
        }
      );
    } else {
      const tierToUse = requestedTier ?? "free";
      const newUser = {
        telegramId: telegramUser.id,
        name: telegramUser.first_name
          ? `${telegramUser.first_name} ${telegramUser.last_name || ""}`.trim()
          : telegramUser.username,
        username: telegramUser.username,
        tier: tierToUse,
        createdAt: new Date(),
        lastLogin: new Date(),
      };

      console.log("[Telegram Auth API] Creating new user with data:", {
        telegramId: newUser.telegramId,
        name: newUser.name,
        username: newUser.username,
        tier: newUser.tier,
      });

      const result = await usersCollection.insertOne(newUser);
      userId = result.insertedId.toString();
      userTier = tierToUse;

      console.log("[Telegram Auth API] New user created with ID:", userId);
    }

    await upsertTelegramUser({
      telegramId: telegramUser.id,
      id: userId,
      email: telegramUser.username,
      telegramChatId: resolvedChatId,
      name: telegramUser.first_name || telegramUser.username || "User",
      lastLogin: new Date(),
    });

    const token = await new SignJWT({
      sub: userId,
      telegramId: telegramUser.id,
      name: telegramUser.first_name || telegramUser.username || "User",
      tier: userTier,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(env.JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        telegramId: telegramUser.id,
        name: telegramUser.first_name || telegramUser.username || "User",
        tier: userTier,
        isAdmin: userTier === "admin",
        mock: isMockMode,
      },
      token,
    });

    response.cookies.set("telegram-auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    console.log("[Telegram Auth API] Authentication completed successfully", {
      isMockMode,
      userId,
      tier: userTier,
    });

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
    const { payload } = await jwtVerify(token, env.JWT_SECRET);

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
