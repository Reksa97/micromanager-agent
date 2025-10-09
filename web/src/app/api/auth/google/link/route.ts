import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/env";
import { nanoid } from "nanoid";

/**
 * GET /api/auth/google/link?telegramId=123456
 * OR
 * GET /api/auth/google/link?token=<telegram-jwt-token>
 * Initiates Google OAuth flow for linking a Telegram account
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const telegramIdParam = searchParams.get("telegramId");
    const tokenParam = searchParams.get("token");

    let telegramId: number;

    // Option 1: Direct telegramId parameter
    if (telegramIdParam) {
      telegramId = parseInt(telegramIdParam, 10);
      if (isNaN(telegramId)) {
        return NextResponse.json(
          { error: "Invalid telegramId" },
          { status: 400 }
        );
      }
    }
    // Option 2: Extract from Telegram JWT token
    else if (tokenParam) {
      try {
        const { payload } = await jwtVerify(tokenParam, env.JWT_SECRET);

        if (typeof payload.telegramId !== "number") {
          return NextResponse.json(
            { error: "Invalid token: missing telegramId" },
            { status: 400 }
          );
        }

        telegramId = payload.telegramId as number;
      } catch (error) {
        console.error("Token verification failed:", error);
        return NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        );
      }
    }
    // Neither provided
    else {
      return NextResponse.json(
        { error: "telegramId or token is required" },
        { status: 400 }
      );
    }

    // Generate secure state token
    const nonce = nanoid();
    const stateToken = await new SignJWT({
      telegramId,
      nonce,
      purpose: "google-telegram-link",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m") // 5 minutes
      .sign(env.JWT_SECRET);

    // Build Google OAuth URL
    const googleOAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleOAuthUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID || "");
    googleOAuthUrl.searchParams.set(
      "redirect_uri",
      `${process.env.NEXTAUTH_URL || req.nextUrl.origin}/api/auth/callback/google`
    );
    googleOAuthUrl.searchParams.set("response_type", "code");
    googleOAuthUrl.searchParams.set(
      "scope",
      "openid email profile https://www.googleapis.com/auth/calendar"
    );
    googleOAuthUrl.searchParams.set("access_type", "offline");
    googleOAuthUrl.searchParams.set("prompt", "consent");
    googleOAuthUrl.searchParams.set("state", stateToken);

    // Redirect to Google OAuth
    return NextResponse.redirect(googleOAuthUrl.toString());
  } catch (error) {
    console.error("[Google Link] Error initiating OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate Google OAuth" },
      { status: 500 }
    );
  }
}

/**
 * Verify a state token from the OAuth callback
 */
export async function verifyLinkingStateToken(stateToken: string): Promise<{
  telegramId: number;
  nonce: string;
} | null> {
  try {
    const { payload } = await jwtVerify(stateToken, env.JWT_SECRET);

    if (
      payload.purpose !== "google-telegram-link" ||
      typeof payload.telegramId !== "number"
    ) {
      return null;
    }

    return {
      telegramId: payload.telegramId as number,
      nonce: payload.nonce as string,
    };
  } catch (error) {
    console.error("[Google Link] State token verification failed:", error);
    return null;
  }
}
