import { jwtVerify, SignJWT } from "jose";
import { env } from "@/env";

// Define available MCP scopes
export const MCP_SCOPES = {
  USER_CONTEXT_READ: "read:user-context",
  USER_CONTEXT_WRITE: "write:user-context",
  CALENDAR_READ: "calendar:read",
  CALENDAR_WRITE: "calendar:write",
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

// Common scope combinations
export const MCP_SCOPE_SETS = {
  // Full access to everything
  FULL: [
    MCP_SCOPES.USER_CONTEXT_READ,
    MCP_SCOPES.USER_CONTEXT_WRITE,
    MCP_SCOPES.CALENDAR_READ,
    MCP_SCOPES.CALENDAR_WRITE,
  ],
  // Read-only access to user context
  CONTEXT_READ_ONLY: [MCP_SCOPES.USER_CONTEXT_READ],
  // Full access to user context
  CONTEXT_FULL: [MCP_SCOPES.USER_CONTEXT_READ, MCP_SCOPES.USER_CONTEXT_WRITE],
  // Read-only access to calendar
  CALENDAR_READ_ONLY: [
    MCP_SCOPES.USER_CONTEXT_READ, // Often needed with calendar
    MCP_SCOPES.CALENDAR_READ,
  ],
  // Full access to calendar
  CALENDAR_FULL: [
    MCP_SCOPES.USER_CONTEXT_READ,
    MCP_SCOPES.USER_CONTEXT_WRITE,
    MCP_SCOPES.CALENDAR_READ,
    MCP_SCOPES.CALENDAR_WRITE,
  ],
} as const;

export interface McpTokenPayload {
  userId: string;
  googleAccessToken?: string;
  scopes?: string[];
  workflowRunId?: string;
  [key: string]: unknown;
}

/**
 * Generates a single-use MCP token with 1 hour expiry
 * Used for both frontend realtime sessions and backend agents
 *
 * @param userId - User ID to associate with the token
 * @param googleAccessToken - Optional Google access token for calendar operations
 * @param scopes - Optional array of scopes. If not provided, scopes are auto-assigned based on user capabilities
 *
 * @example
 * // Auto-assign scopes (recommended for most use cases)
 * const token = await generateMcpToken(userId, googleToken);
 *
 * @example
 * // Explicit scopes using constants
 * const token = await generateMcpToken(userId, googleToken, [
 *   MCP_SCOPES.USER_CONTEXT_READ,
 *   MCP_SCOPES.CALENDAR_READ
 * ]);
 *
 * @example
 * // Use predefined scope set
 * const token = await generateMcpToken(userId, googleToken, MCP_SCOPE_SETS.CALENDAR_READ_ONLY);
 */
export async function generateMcpToken(
  userId: string,
  googleAccessToken?: string,
  scopes?: readonly string[] | string[],
  workflowRunId?: string
): Promise<string> {
  const secret = env.JWT_SECRET;

  const payload: McpTokenPayload = {
    userId,
  };

  if (googleAccessToken) {
    payload.googleAccessToken = googleAccessToken;
  }

  if (scopes && scopes.length > 0) {
    payload.scopes = [...scopes]; // Convert readonly to mutable array
  }

  if (workflowRunId) {
    payload.workflowRunId = workflowRunId;
  }

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h") // 1 hour expiry for single-session use
    .sign(secret);
}

/**
 * Helper: Generate token with specific scope set
 * Useful for creating tokens with predefined permission levels
 *
 * @example
 * const readOnlyToken = await generateMcpTokenWithScopeSet(userId, googleToken, "CALENDAR_READ_ONLY");
 */
export async function generateMcpTokenWithScopeSet(
  userId: string,
  googleAccessToken: string | undefined,
  scopeSet: keyof typeof MCP_SCOPE_SETS
): Promise<string> {
  return generateMcpToken(userId, googleAccessToken, MCP_SCOPE_SETS[scopeSet]);
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
      scopes: Array.isArray(payload.scopes) ? payload.scopes as string[] : undefined,
      workflowRunId: payload.workflowRunId as string | undefined,
    };
  } catch (error) {
    console.error("MCP token verification failed:", error);
    return null;
  }
}
