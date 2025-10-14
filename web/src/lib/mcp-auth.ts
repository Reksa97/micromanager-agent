import { jwtVerify, SignJWT } from "jose";
import { env } from "@/env";

export interface McpTokenPayload {
  userId: string;
  googleAccessToken?: string;
  [key: string]: unknown;
}

/**
 * Generates a single-use MCP token with 1 hour expiry
 * Used for both frontend realtime sessions and backend agents
 */
export async function generateMcpToken(
  userId: string,
  googleAccessToken?: string
): Promise<string> {
  const secret = env.JWT_SECRET;

  const payload: McpTokenPayload = {
    userId,
  };

  if (googleAccessToken) {
    payload.googleAccessToken = googleAccessToken;
  }

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h") // 1 hour expiry for single-session use
    .sign(secret);
}

/**
 * Verifies an MCP token and returns the payload
 * Returns null if token is invalid or expired
 */
export async function verifyMcpToken(
  token: string
): Promise<McpTokenPayload | null> {
  try {
    const secret = env.JWT_SECRET;
    const { payload } = await jwtVerify(token, secret);

    if (!payload.userId || typeof payload.userId !== "string") {
      console.error("Invalid MCP token: missing or invalid userId");
      return null;
    }

    return {
      userId: payload.userId as string,
      googleAccessToken: payload.googleAccessToken as string | undefined,
    };
  } catch (error) {
    console.error("MCP token verification failed:", error);
    return null;
  }
}
