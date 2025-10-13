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
import { logToolCall, getDefaultToolDisplayInfo } from "@/lib/workflow-runs";
import { ObjectId } from "mongodb";

const formatMcpResponse = (response: string): CallToolResult => ({
  content: [{ type: "text", text: response }],
});

// Scope map for tool authorization
const TOOL_SCOPE_MAP: Record<string, string[]> = {
  get_user_context: ["read:user-context"],
  update_user_context: ["write:user-context"],
  get_conversation_messages: ["read:user-context"],
  "list-calendars": ["calendar:read"],
  list_calendars: ["calendar:read"],
  "list-events": ["calendar:read"],
  list_events: ["calendar:read"],
  "search-events": ["calendar:read"],
  search_events: ["calendar:read"],
  "get-event": ["calendar:read"],
  get_event: ["calendar:read"],
  "list-colors": ["calendar:read"],
  list_colors: ["calendar:read"],
  "create-event": ["calendar:write"],
  create_event: ["calendar:write"],
  "update-event": ["calendar:write"],
  update_event: ["calendar:write"],
  "delete-event": ["calendar:write"],
  delete_event: ["calendar:write"],
  "get-freebusy": ["calendar:read"],
  get_freebusy: ["calendar:read"],
  "get-current-time": ["calendar:read"],
  get_current_time: ["calendar:read"],
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
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          ),
      },
      async ({ getAllData, log_message }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "get_user_context";

        // Get display info from agent's log_message or fallback
        const displayInfo = log_message
          ? { displayTitle: log_message, displayDescription: "" }
          : getDefaultToolDisplayInfo(toolName);

        // Log tool start (only if workflowRunId exists)
        if (workflowRunId) {
          await logToolCall(workflowRunId, toolCallId, {
            toolName,
            displayTitle: displayInfo.displayTitle,
            displayDescription: displayInfo.displayDescription,
            arguments: { getAllData },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP["get_user_context"];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            "[MCP Auth] Missing required scope for get_user_context"
          );
          const errorMsg =
            "Access denied: Missing required scope 'read:user-context'";

          // Log error
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "error",
              error: errorMsg,
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call error:", err)
            );
          }

          return formatMcpResponse(errorMsg);
        }

        try {
          const userId = extra?.authInfo?.clientId;
          console.log("get_user_context", { getAllData, userId });
          if (!userId) {
            console.error("User ID is required", { authInfo: extra?.authInfo });
            const errorMsg = "User ID is required";

            // Log error
            if (workflowRunId) {
              await logToolCall(workflowRunId, toolCallId, {
                status: "error",
                error: errorMsg,
                updatedAt: new Date(),
              }).catch((err) =>
                console.error("Failed to log tool call error:", err)
              );
            }

            return formatMcpResponse(errorMsg);
          }
          const userContextDoc = await getUserContextDocument(userId);
          console.log("User context fetched", {
            userId,
            userContextDoc,
            getAllData,
          });

          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }

          return formatMcpResponse(
            JSON.stringify(userContextDoc.data, null, 2)
          );
        } catch (error) {
          console.error("Failed to get user context", error);
          const errorMsg = `Failed to get user context: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;

          // Log error
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "error",
              error: errorMsg,
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call error:", err)
            );
          }

          return formatMcpResponse(errorMsg);
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
          .describe(
            "Array of updates. Path uses dot notation. Value accepts any type (string, number, object, array, etc.)"
          ),
        contextDeletes: z
          .array(z.string())
          .optional()
          .describe("Array of paths to delete (dot notation)"),
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          ),
      },
      async ({ contextUpdates, contextDeletes, log_message }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "update_user_context";

        // Get display info from agent's log_message or fallback
        const displayInfo = log_message
          ? { displayTitle: log_message, displayDescription: "" }
          : getDefaultToolDisplayInfo(toolName);

        // Log tool start (only if workflowRunId exists)
        if (workflowRunId) {
          await logToolCall(workflowRunId, toolCallId, {
            toolName,
            displayTitle: displayInfo.displayTitle,
            displayDescription: displayInfo.displayDescription,
            arguments: { contextUpdates, contextDeletes },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP["update_user_context"];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            "[MCP Auth] Missing required scope for update_user_context"
          );
          const errorMsg =
            "Access denied: Missing required scope 'write:user-context'";

          // Log error
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "error",
              error: errorMsg,
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call error:", err)
            );
          }

          return formatMcpResponse(errorMsg);
        }

        try {
          if (!contextUpdates && !contextDeletes) {
            const errorMsg = "No updates or deletes provided";

            // Log error
            if (workflowRunId) {
              await logToolCall(workflowRunId, toolCallId, {
                status: "error",
                error: errorMsg,
                updatedAt: new Date(),
              }).catch((err) =>
                console.error("Failed to log tool call error:", err)
              );
            }

            return formatMcpResponse(errorMsg);
          }
          const userId = extra?.authInfo?.clientId;
          console.log("update_user_context", {
            contextUpdates,
            contextDeletes,
            userId,
          });
          if (!userId) {
            console.error("User ID is required", { authInfo: extra?.authInfo });
            const errorMsg = "User ID is required";

            // Log error
            if (workflowRunId) {
              await logToolCall(workflowRunId, toolCallId, {
                status: "error",
                error: errorMsg,
                updatedAt: new Date(),
              }).catch((err) =>
                console.error("Failed to log tool call error:", err)
              );
            }

            return formatMcpResponse(errorMsg);
          }
          let userContextDoc: UserContextDocument | null = null;
          if (contextUpdates && contextUpdates.length > 0) {
            userContextDoc = await updateUserContextDocument(
              userId,
              contextUpdates
            );
            console.log("User context updated", {
              userId,
              contextUpdates,
            });
          }
          if (contextDeletes && contextDeletes.length > 0) {
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

          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }

          return formatMcpResponse(
            JSON.stringify(userContextDoc!.data, null, 2)
          );
        } catch (error) {
          console.error("Failed to update user context", error);
          const errorMsg = `Failed to update user context: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;

          // Log error
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "error",
              error: errorMsg,
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call error:", err)
            );
          }

          return formatMcpResponse(errorMsg);
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
          .describe(
            "Maximum number of messages to retrieve (default: 20, max: 100)"
          ),
        before_message_id: z
          .string()
          .optional()
          .describe("Optional: Only get messages before this message ID"),
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          ),
      },
      async ({ limit, before_message_id, log_message }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "get_conversation_messages";

        // Get display info from agent's log_message or fallback
        const displayInfo = log_message
          ? { displayTitle: log_message, displayDescription: "" }
          : getDefaultToolDisplayInfo(toolName);

        // Log tool start (only if workflowRunId exists)
        if (workflowRunId) {
          await logToolCall(workflowRunId, toolCallId, {
            toolName,
            displayTitle: displayInfo.displayTitle,
            displayDescription: displayInfo.displayDescription,
            arguments: { limit, before_message_id },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP["get_conversation_messages"];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            "[MCP Auth] Missing required scope for get_conversation_messages"
          );
          const errorMsg =
            "Access denied: Missing required scope 'read:user-context'";

          // Log error
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "error",
              error: errorMsg,
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call error:", err)
            );
          }

          return formatMcpResponse(errorMsg);
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
            const errorMsg = "User ID is required";

            // Log error
            if (workflowRunId) {
              await logToolCall(workflowRunId, toolCallId, {
                status: "error",
                error: errorMsg,
                updatedAt: new Date(),
              }).catch((err) =>
                console.error("Failed to log tool call error:", err)
              );
            }

            return formatMcpResponse(errorMsg);
          }

          // Get messages from MongoDB
          const messages = await getRecentMessages(userId, limit ?? 20);

          // Filter by before_message_id if provided
          let filteredMessages = messages;
          if (before_message_id) {
            const beforeIndex = messages.findIndex(
              (msg) =>
                msg.id === before_message_id ||
                msg._id?.toString() === before_message_id
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

          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }

          return formatMcpResponse(JSON.stringify(formattedMessages, null, 2));
        } catch (error) {
          console.error("Failed to get conversation messages", error);
          const errorMsg = `Failed to get conversation messages: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;

          // Log error
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "error",
              error: errorMsg,
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call error:", err)
            );
          }

          return formatMcpResponse(errorMsg);
        }
      }
    );

    ToolRegistry.getToolsWithSchemas().forEach((tool) => {
      const originalZodSchema = ToolSchemas[tool.name];

      // const extendedZodSchema = z.object({
      //   log_message: z
      //     .string()
      //     .optional()
      //     .describe(
      //       "Short human-readable description of what you're doing with this tool."
      //     ),
      //   tool_args: originalZodSchema,
      // });

      // Extract the JSON schema shape from the extended Zod schema
      // const extendedSchemaShape =
      //   ToolRegistry.extractSchemaShape(extendedZodSchema);

      server.tool(
        tool.name,
        tool.description,
        {
          log_message: z
            .string()
            .optional()
            .describe(
              "Short human-readable description of what you're doing with this tool."
            ),
          tool_args: originalZodSchema,
        },
        async (args, extra) => {
          const toolCallId = new ObjectId().toString();
          if (!extra) {
            console.warn("[MCP] Extra is undefined", {
              args,
              extra,
            });
          }
          const authInfo = extra?.authInfo as AuthInfo | undefined;
          if (!authInfo) {
            console.error("[MCP] Auth info is required", { args, extra });
            return formatMcpResponse("Auth info is required");
          }
          const workflowRunId = authInfo?.extra?.workflowRunId as
            | string
            | undefined;
          const toolName = tool.name;

          console.log("[MCP] Tool called", { toolName, args, extra });

          // Extract log_message from args
          const { log_message, tool_args } = args as {
            log_message?: string;
            tool_args?: Record<string, unknown>;
          };

          // Get display info from agent's log_message or fallback
          const displayInfo = log_message
            ? { displayTitle: log_message, displayDescription: "" }
            : getDefaultToolDisplayInfo(toolName);

          // Log tool start (only if workflowRunId exists)
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              toolName,
              displayTitle: displayInfo.displayTitle,
              displayDescription: displayInfo.displayDescription,
              arguments: tool_args,
              status: "pending",
              createdAt: new Date(),
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call start:", err)
            );
          }

          // Check scope authorization
          const requiredScopes = TOOL_SCOPE_MAP[tool.name] ?? [];
          if (!userHasScope(requiredScopes, authInfo)) {
            console.error(
              `[MCP Auth] Missing required scope for ${tool.name}`,
              {
                required: requiredScopes,
                userScopes: authInfo?.scopes,
              }
            );
            const errorMsg = `Access denied: Missing required scope for ${
              tool.name
            }. Required: ${requiredScopes.join(", ")}`;

            // Log error
            if (workflowRunId) {
              await logToolCall(workflowRunId, toolCallId, {
                status: "error",
                error: errorMsg,
                updatedAt: new Date(),
              }).catch((err) =>
                console.error("Failed to log tool call error:", err)
              );
            }

            return formatMcpResponse(errorMsg);
          }

          try {
            const oAuth2Client = new OAuth2Client({
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            });

            const googleAccessToken = authInfo?.extra?.googleAccessToken;

            if (!googleAccessToken || typeof googleAccessToken !== "string") {
              console.log("[MCP] Missing google access token");
              const errorMsg = "Missing Google access token";

              // Log error
              if (workflowRunId) {
                await logToolCall(workflowRunId, toolCallId, {
                  status: "error",
                  error: errorMsg,
                  updatedAt: new Date(),
                }).catch((err) =>
                  console.error("Failed to log tool call error:", err)
                );
              }

              return formatMcpResponse(errorMsg);
            }

            oAuth2Client.setCredentials({ access_token: googleAccessToken });
            const result = await new calendarToolHandlers[tool.name]().runTool(
              tool_args,
              oAuth2Client
            );

            // Log success
            if (workflowRunId) {
              await logToolCall(workflowRunId, toolCallId, {
                status: "success",
                updatedAt: new Date(),
              }).catch((err) =>
                console.error("Failed to log tool call success:", err)
              );
            }

            return formatMcpResponse(JSON.stringify(result, null, 2));
          } catch (error) {
            console.error("Failed ", error);
            const errorMsg = `Failed to invoke ${tool.name}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

            // Log error
            if (workflowRunId) {
              await logToolCall(workflowRunId, toolCallId, {
                status: "error",
                error: errorMsg,
                updatedAt: new Date(),
              }).catch((err) =>
                console.error("Failed to log tool call error:", err)
              );
            }

            return formatMcpResponse(errorMsg);
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
          const scopeStr =
            scopes.length > 0 ? ` (requires: ${scopes.join(", ")})` : "";
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
    console.error("[MCP Auth] Invalid or expired MCP token");
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
    workflowRunId: payload.workflowRunId,
  });

  return {
    token: bearerToken,
    scopes: userScopes,
    clientId: payload.userId,
    extra: {
      googleAccessToken: payload.googleAccessToken,
      workflowRunId: payload.workflowRunId,
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
