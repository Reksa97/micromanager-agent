import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { auth } from "@/auth";
import { env } from "@/env";
import { generateMcpToken } from "@/lib/mcp-auth";

/**
 * POST /api/mcp/token
 * Generates a single-use MCP token for authenticated users
 * Token is valid for 1 hour and includes userId and googleAccessToken (if available)
 */
export async function POST(request: NextRequest) {
  // Try NextAuth session first
  const session = await auth();
  let userId = session?.user?.id;
  const googleAccessToken = session?.googleAccessToken;

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
      console.error("[MCP Token API] Failed to verify Telegram token", error);
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized - valid session required" },
      { status: 401 }
    );
  }

  try {
    const mcpToken = await generateMcpToken(
      userId,
      googleAccessToken ?? undefined
    );

    return NextResponse.json({
      token: mcpToken,
      expiresIn: 3600, // 1 hour in seconds
    });
  } catch (error) {
    console.error("[MCP Token API] Failed to generate token", error);
    return NextResponse.json(
      { error: "Failed to generate MCP token" },
      { status: 500 }
    );
  }
}
