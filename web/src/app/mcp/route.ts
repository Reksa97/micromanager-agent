import {
  getUserContextDocument,
  updateUserContextDocument,
  UserContextDocument,
} from "@/lib/user-context";
import { getRecentMessages } from "@/lib/conversations";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import {
  ToolRegistry,
  ToolSchemas,
} from "@cocal/google-calendar-mcp/src/tools/registry";
import { ListCalendarsHandler } from "@cocal/google-calendar-mcp/src/handlers/core/ListCalendarsHandler";
import { ListEventsHandler } from "@cocal/google-calendar-mcp/src/handlers/core/ListEventsHandler";
import { SearchEventsHandler } from "@cocal/google-calendar-mcp/src/handlers/core/SearchEventsHandler";
import { GetEventHandler } from "@cocal/google-calendar-mcp/src/handlers/core/GetEventHandler";
import { ListColorsHandler } from "@cocal/google-calendar-mcp/src/handlers/core/ListColorsHandler";
import { CreateEventHandler } from "@cocal/google-calendar-mcp/src/handlers/core/CreateEventHandler";
import { UpdateEventHandler } from "@cocal/google-calendar-mcp/src/handlers/core/UpdateEventHandler";
import { DeleteEventHandler } from "@cocal/google-calendar-mcp/src/handlers/core/DeleteEventHandler";
import { FreeBusyEventHandler } from "@cocal/google-calendar-mcp/src/handlers/core/FreeBusyEventHandler";
import { GetCurrentTimeHandler } from "@cocal/google-calendar-mcp/src/handlers/core/GetCurrentTimeHandler";
import { env } from "@/env";
import { OAuth2Client } from "@cocal/google-calendar-mcp/node_modules/google-auth-library";
import { verifyMcpToken } from "@/lib/mcp-auth";

const formatMcpResponse = (response: string): CallToolResult => ({
  content: [{ type: "text", text: response }],
});

// Scope map for tool authorization
const TOOL_SCOPE_MAP: Record<string, string[]> = {
  "get_user_context": ["read:user-context"],
  "update_user_context": ["write:user-context"],
  "get_conversation_messages": ["read:user-context"],
  "list-calendars": ["calendar:read"],
  "list_calendars": ["calendar:read"],
  "list-events": ["calendar:read"],
  "list_events": ["calendar:read"],
  "search-events": ["calendar:read"],
  "search_events": ["calendar:read"],
  "get-event": ["calendar:read"],
  "get_event": ["calendar:read"],
  "list-colors": ["calendar:read"],
  "list_colors": ["calendar:read"],
  "create-event": ["calendar:write"],
  "create_event": ["calendar:write"],
  "update-event": ["calendar:write"],
  "update_event": ["calendar:write"],
  "delete-event": ["calendar:write"],
  "delete_event": ["calendar:write"],
  "get-freebusy": ["calendar:read"],
  "get_freebusy": ["calendar:read"],
  "get-current-time": ["calendar:read"],
  "get_current_time": ["calendar:read"],
};

// Helper functions for scope checking
const scopesFromAuth = (auth?: AuthInfo): Set<string> =>
  new Set(auth?.scopes ?? []);

const userHasScope = (required: string[], auth?: AuthInfo): boolean =>
  required.length === 0 ||
  required.some((scope) => scopesFromAuth(auth).has(scope));

// These helper functions are available for future dynamic capability filtering
// Currently, all tools are listed in capabilities and access control is enforced at runtime
// const visibleToolNames = (auth?: AuthInfo): string[] =>
//   Object.entries(TOOL_SCOPE_MAP)
//     .filter(([name, scopes]) => userHasScope(scopes, auth))
//     .map(([name]) => name);
//
// const getToolCapabilities = (auth?: AuthInfo) => {
//   const visible = visibleToolNames(auth);
//   const capabilities: Record<string, { description: string }> = {};
//
//   visible.forEach((toolName) => {
//     const normalizedName = toolName.replace("-", "_");
//
//     // Check if it's a context tool
//     if (toolName === "get_user_context") {
//       capabilities[normalizedName] = { description: "Get the user context" };
//     } else if (toolName === "update_user_context") {
//       capabilities[normalizedName] = { description: "Update the user context" };
//     } else {
//       // It's a calendar tool
//       const calendarToolName = toolName.replace("_", "-");
//       const toolInfo = ToolRegistry.getToolsWithSchemas().find(
//         (t) => t.name === calendarToolName
//       );
//       if (toolInfo) {
//         capabilities[normalizedName] = { description: toolInfo.description };
//       }
//     }
//   });
//
//   return capabilities;
// };

const calendarToolHandlers = {
  "list-calendars": ListCalendarsHandler,
  "list-events": ListEventsHandler,
  "search-events": SearchEventsHandler,
  "get-event": GetEventHandler,
  "list-colors": ListColorsHandler,
  "create-event": CreateEventHandler,
  "update-event": UpdateEventHandler,
  "delete-event": DeleteEventHandler,
  "get-freebusy": FreeBusyEventHandler,
  "get-current-time": GetCurrentTimeHandler,
};

// StreamableHttp server
const handler = createMcpHandler(
  async (server) => {
    server.tool(
      "get_user_context",
      "Get the user context",
      {
        getAllData: z.boolean().optional(),
      },
      async ({ getAllData }, extra) => {
        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP["get_user_context"];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error("[MCP Auth] Missing required scope for get_user_context");
          return formatMcpResponse(
            "Access denied: Missing required scope 'read:user-context'"
          );
        }

        try {
          const userId = extra?.authInfo?.clientId;
          console.log("get_user_context", { getAllData, userId });
          if (!userId) {
            console.error("User ID is required", { authInfo: extra?.authInfo });
            return formatMcpResponse("User ID is required");
          }
          const userContextDoc = await getUserContextDocument(userId);
          console.log("User context fetched", {
            userId,
            userContextDoc,
            getAllData,
          });
          return formatMcpResponse(
            JSON.stringify(userContextDoc.data, null, 2)
          );
        } catch (error) {
          console.error("Failed to get user context", error);
          return formatMcpResponse(
            `Failed to get user context: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    );
    server.tool(
      "update_user_context",
      "Update user context with nested data. Use dot notation for paths (e.g., 'tasks.0.title'). Value can be any type including objects and arrays. Use contextDeletes to remove fields.",
      {
        contextUpdates: z
          .array(z.object({ path: z.string(), value: z.any() }))
          .optional()
          .describe("Array of updates. Path uses dot notation. Value accepts any type (string, number, object, array, etc.)"),
        contextDeletes: z.array(z.string()).optional().describe("Array of paths to delete (dot notation)"),
      },
      async ({ contextUpdates, contextDeletes }, extra) => {
        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP["update_user_context"];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error("[MCP Auth] Missing required scope for update_user_context");
          return formatMcpResponse(
            "Access denied: Missing required scope 'write:user-context'"
          );
        }

        try {
          if (!contextUpdates && !contextDeletes) {
            return formatMcpResponse("No updates or deletes provided");
          }
          const userId = extra?.authInfo?.clientId;
          console.log("update_user_context", {
            contextUpdates,
            contextDeletes,
            userId,
          });
          if (!userId) {
            console.error("User ID is required", { authInfo: extra?.authInfo });
            return formatMcpResponse("User ID is required");
          }
          let userContextDoc: UserContextDocument | null = null;
          if (contextUpdates) {
            userContextDoc = await updateUserContextDocument(
              userId,
              contextUpdates
            );
            console.log("User context updated", {
              userId,
              contextUpdates,
            });
          }
          if (contextDeletes) {
            userContextDoc = await updateUserContextDocument(
              userId,
              contextDeletes.map((path) => ({ path, value: undefined }))
            );
            console.log("Context deleted", {
              userId,
              contextDeletes,
            });
          }
          console.log("User context after updates", {
            userId,
            userContext: JSON.stringify(userContextDoc!.data),
          });
          return formatMcpResponse(
            JSON.stringify(userContextDoc!.data, null, 2)
          );
        } catch (error) {
          console.error("Failed to update user context", error);
          return formatMcpResponse(
            `Failed to update user context: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    );

    server.tool(
      "get_conversation_messages",
      "Get recent conversation messages. Returns messages in chronological order (oldest first).",
      {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Maximum number of messages to retrieve (default: 20, max: 100)"),
        before_message_id: z
          .string()
          .optional()
          .describe("Optional: Only get messages before this message ID"),
      },
      async ({ limit, before_message_id }, extra) => {
        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP["get_conversation_messages"];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            "[MCP Auth] Missing required scope for get_conversation_messages"
          );
          return formatMcpResponse(
            "Access denied: Missing required scope 'read:user-context'"
          );
        }

        try {
          const userId = extra?.authInfo?.clientId;
          console.log("get_conversation_messages", {
            limit,
            before_message_id,
            userId,
          });

          if (!userId) {
            console.error("User ID is required", { authInfo: extra?.authInfo });
            return formatMcpResponse("User ID is required");
          }

          // Get messages from MongoDB
          const messages = await getRecentMessages(userId, limit ?? 20);

          // Filter by before_message_id if provided
          let filteredMessages = messages;
          if (before_message_id) {
            const beforeIndex = messages.findIndex(
              (msg) => msg.id === before_message_id || msg._id?.toString() === before_message_id
            );
            if (beforeIndex > 0) {
              filteredMessages = messages.slice(0, beforeIndex);
            }
          }

          // Format for agent consumption
          const formattedMessages = filteredMessages.map((msg) => ({
            id: msg.id || msg._id?.toString(),
            role: msg.role,
            content: msg.content,
            source: msg.source,
            createdAt: msg.createdAt?.toISOString(),
          }));

          console.log("Conversation messages fetched", {
            userId,
            count: formattedMessages.length,
            limit,
          });

          return formatMcpResponse(JSON.stringify(formattedMessages, null, 2));
        } catch (error) {
          console.error("Failed to get conversation messages", error);
          return formatMcpResponse(
            `Failed to get conversation messages: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    );

    ToolRegistry.getToolsWithSchemas().forEach((tool) => {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: ToolRegistry.extractSchemaShape(ToolSchemas[tool.name]),
        },
        async (args, extra) => {
          // Check scope authorization
          const requiredScopes =
            TOOL_SCOPE_MAP[tool.name] ?? TOOL_SCOPE_MAP[tool.name.replace("_", "-")] ?? [];
          if (!userHasScope(requiredScopes, extra?.authInfo)) {
            console.error(`[MCP Auth] Missing required scope for ${tool.name}`, {
              required: requiredScopes,
              userScopes: extra?.authInfo?.scopes,
            });
            return formatMcpResponse(
              `Access denied: Missing required scope for ${tool.name}. Required: ${requiredScopes.join(", ")}`
            );
          }

          try {
            const oAuth2Client = new OAuth2Client({
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            });

            const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken;

            if (!googleAccessToken || typeof googleAccessToken !== "string") {
              console.log("Missing google access token");
              return formatMcpResponse("Missing Google access token");
            }

            oAuth2Client.setCredentials({ access_token: googleAccessToken });
            const result = await new calendarToolHandlers[tool.name]().runTool(
              args,
              oAuth2Client
            );
            return formatMcpResponse(JSON.stringify(result, null, 2));
          } catch (error) {
            console.error("Failed ", error);
            return formatMcpResponse(
              `Failed to invoke ${tool.name}: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }
      );
    });
  },
  {
    capabilities: {
      // NOTE: Tool capabilities are listed here for discovery purposes.
      // Access control is enforced at runtime via scope checks in each tool handler.
      // Users will only be able to execute tools they have scopes for.
      // To generate scoped tokens, use generateMcpToken(userId, googleToken, scopes).
      // Available scopes: read:user-context, write:user-context, calendar:read, calendar:write
      tools: {
        get_user_context: {
          description: "Get the user context (requires: read:user-context)",
        },
        update_user_context: {
          description: "Update the user context (requires: write:user-context)",
        },
        get_conversation_messages: {
          description:
            "Get recent conversation messages (requires: read:user-context)",
        },
        ...ToolRegistry.getToolsWithSchemas().reduce((rest, tool) => {
          const scopes = TOOL_SCOPE_MAP[tool.name] || [];
          const scopeStr = scopes.length > 0 ? ` (requires: ${scopes.join(", ")})` : "";
          return {
            ...rest,
            [tool.name.replace("-", "_")]: {
              description: tool.description + scopeStr,
            },
          };
        }, {}),
      },
    },
  },
  {
    basePath: "",
    verboseLogs: true,
    maxDuration: 60,
    disableSse: true,
  }
);

const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  console.log("[MCP Auth] Received request with token:", {
    hasBearerToken: !!bearerToken,
    tokenPreview: bearerToken ? bearerToken.substring(0, 20) + "..." : "none",
  });

  if (!bearerToken) {
    console.error("Bearer token is required");
    return undefined;
  }

  // Check for development API key (never expires, hardcoded test user)
  const devApiKey = env.MCP_DEVELOPMENT_API_KEY;
  if (devApiKey && bearerToken === devApiKey) {
    const testUserId = process.env.MCP_DEV_TEST_USER_ID || "999000000";
    console.log(
      "[MCP Dev Auth] Using development API key with test user:",
      testUserId
    );

    // Fetch Google token from DB with auto-refresh
    const { getGoogleAccessToken } = await import("@/lib/google-tokens");
    let googleAccessToken = await getGoogleAccessToken(testUserId);

    // Fallback to env var if no DB token
    if (!googleAccessToken) {
      console.log("[MCP Dev Auth] No DB token, falling back to env var");
      googleAccessToken =
        process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING ?? null;
    } else {
      console.log("[MCP Dev Auth] Using DB token (auto-refreshed if needed)");
    }

    // Dev users get all scopes
    const devScopes = [
      "read:user-context",
      "write:user-context",
      "calendar:read",
      "calendar:write",
    ];

    return {
      token: bearerToken,
      scopes: devScopes,
      clientId: testUserId,
      extra: {
        googleAccessToken: googleAccessToken,
      },
    };
  }

  // Verify the MCP token and extract user info
  const payload = await verifyMcpToken(bearerToken);

  if (!payload) {
    console.error("Invalid or expired MCP token");
    return undefined;
  }

  // Determine user scopes based on token payload and capabilities
  const userScopes: string[] = [];

  // If token has explicit scopes, use those
  if (payload.scopes && payload.scopes.length > 0) {
    userScopes.push(...payload.scopes);
  } else {
    // Otherwise, grant based on capabilities
    // All users get context access
    userScopes.push("read:user-context", "write:user-context");

    // If user has Google token, they get calendar access
    if (payload.googleAccessToken) {
      userScopes.push("calendar:read", "calendar:write");
    }
  }

  console.log("[MCP Auth] Verified token", {
    userId: payload.userId,
    googleAccessToken: payload.googleAccessToken?.substring(0, 20) + "...",
    hasGoogleAccessToken: !!payload.googleAccessToken,
    tokenScopes: payload.scopes,
    assignedScopes: userScopes,
  });

  return {
    token: bearerToken,
    scopes: userScopes,
    clientId: payload.userId,
    extra: {
      googleAccessToken: payload.googleAccessToken,
    },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  // No global requiredScopes - we enforce scopes per-tool for fine-grained control
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export {
  authHandler as GET,
  authHandler as POST,
  authHandler as DELETE,
  authHandler as OPTIONS,
};
