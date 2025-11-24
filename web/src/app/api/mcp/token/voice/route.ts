import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { auth } from "@/auth";
import { env } from "@/env";
import { generateMcpToken } from "@/lib/mcp-auth";
import { getGoogleAccessToken } from "@/lib/google-tokens";

/**
 * POST /api/mcp/token/voice
 * Generates an MCP token optimized for realtime voice: does NOT embed the Google token,
 * and instead enables server-side lookup to keep the Authorization header small.
 */
export async function POST(request: NextRequest) {
  // Try NextAuth session first
  const session = await auth();
  let userId = session?.user?.id;

  // If no NextAuth session, check for Telegram JWT
  if (!userId) {
    try {
      let token = request.cookies.get("telegram-auth-token")?.value;
      const authHeader = request.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      if (token) {
        const { payload } = await jwtVerify(token, env.JWT_SECRET);
        userId = typeof payload.sub === "string" ? payload.sub : undefined;
      }
    } catch (error) {
      console.error("[MCP Voice Token API] Failed to verify Telegram token", error);
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized - valid session required" },
      { status: 401 }
    );
  }

  try {
    // Voice tokens avoid embedding Google tokens to keep headers small.
    // The MCP server will fetch the Google token itself using the userId.
    const mcpToken = await generateMcpToken(
      userId,
      undefined,
      undefined,
      undefined,
      {
        includeGoogleAccessToken: false,
        allowGoogleTokenLookup: true,
      }
    );

    return NextResponse.json({
      token: mcpToken,
      expiresIn: 3600, // 1 hour in seconds
    });
  } catch (error) {
    console.error("[MCP Voice Token API] Failed to generate token", error);
    return NextResponse.json(
      { error: "Failed to generate MCP token" },
      { status: 500 }
    );
  }
}
