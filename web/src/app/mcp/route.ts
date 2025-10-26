import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { google } from "googleapis";

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
import { getGoogleAccessToken } from "@/lib/google-tokens";
import {
  getUserContextDocument,
  updateUserContextDocument,
  UserContextDocument,
} from "@/lib/user-context";
import { getRecentMessages } from "@/lib/conversations";
import {
  getTaskLists,
  getTasks,
  insertTaskList,
  insertTask,
  updateTask,
  TaskItem,
  clearTasks
} from "@/lib/google-tasks";
import {
  listWorkplans,
  normalizeEventSnapshot,
} from "@/lib/workplans";
import {
  ensureWorkplanForEvent,
  regenerateWorkplanForEvent,
  WorkplanGenerationInput,
} from "@/lib/workplan-generator";
import { fetchUpcomingCalendarItems } from "@/lib/calendar";
import {
  WORKPLAN_DEFAULT_EVENT_LIMIT,
  WORKPLAN_MAX_EVENT_LIMIT,
} from "@/lib/constants";

const formatMcpResponse = (response: string): CallToolResult => ({
  content: [{ type: "text", text: response }],
});

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

export type McpToolName =
  | "get_user_context"
  | "update_user_context"
  | "get_conversation_messages"
  | "get_google_tasks"
  | "get_google_task_lists"
  | "create_google_task_list"
  | "insert_google_task"
  | "update_google_task"
  | "get_workplans"
  | "update_workplan"
  | keyof typeof calendarToolHandlers;

// Scope map for tool authorization
const TOOL_SCOPE_MAP: Record<McpToolName, string[]> = {
  get_user_context: ["read:user-context"],
  update_user_context: ["write:user-context"],
  get_conversation_messages: ["read:user-context"],
  "list-calendars": ["calendar:read"],
  "list-events": ["calendar:read"],
  "search-events": ["calendar:read"],
  "get-event": ["calendar:read"],
  "list-colors": ["calendar:read"],
  "create-event": ["calendar:write"],
  "update-event": ["calendar:write"],
  "delete-event": ["calendar:write"],
  "get-freebusy": ["calendar:read"],
  "get-current-time": ["calendar:read"],
  get_google_task_lists: ["tasks:read"],
  get_google_tasks: ["tasks:read"],
  create_google_task_list: ["tasks:write"],
  insert_google_task: ["tasks:write"],
  update_google_task: ["tasks:write"],
  get_workplans: ["read:user-context"],
  update_workplan: ["write:user-context"]
};

const scopesFromAuth = (auth?: AuthInfo): Set<string> =>
  new Set(auth?.scopes ?? []);

const userHasScope = (required: string[], auth?: AuthInfo): boolean =>
  required.length === 0 ||
  required.some((scope) => scopesFromAuth(auth).has(scope));

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
    server.tool(
      "get_google_task_lists",
      "Fetches all task_lists",
      {
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          )
      },
      async ({ log_message }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "get_google_task_lists";

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
            arguments: {},
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP[toolName];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            `[MCP Auth] Missing required scope for ${toolName}`
          );
          const errorMsg =
            `Access denied: Missing required scope ${TOOL_SCOPE_MAP[toolName]}`;
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
          const oAuth2Client = new google.auth.OAuth2();
          const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken;
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

          const tasksClient = google.tasks({ version: "v1", auth: oAuth2Client });
          const taskLists = await getTaskLists(tasksClient)

          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }

          return formatMcpResponse(JSON.stringify(taskLists, null, 2));
        } catch (error) {
          console.warn("[Calendar Tasks API] Failed to get task lists:", error);
          const errorMsg = `[Calendar Tasks API] Failed to get task lists: ${
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
          return formatMcpResponse("Failed to get task lists")
        }
      }
    );
    server.tool(
      "get_google_tasks",
      "Fetches all tasks in given timeframe",
      {
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          ),
        dueMin: z
          .string()
          .datetime(),
        dueMax: z
          .string()
          .datetime(),
        showCompleted: z
          .boolean()
      },
      async ({ log_message, dueMin, dueMax, showCompleted }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "get_google_tasks";

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
            arguments: { dueMin, dueMax, showCompleted },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP[toolName];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            `[MCP Auth] Missing required scope for ${toolName}`
          );
          const errorMsg =
            `Access denied: Missing required scope ${TOOL_SCOPE_MAP[toolName]}`;
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
          const oAuth2Client = new google.auth.OAuth2();
          const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken;
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

          const tasksClient = google.tasks({ version: "v1", auth: oAuth2Client });
          const tasksLists = await getTaskLists(tasksClient)
          const tasks: TaskItem[] = await getTasks(
            tasksClient,
            tasksLists,
            showCompleted,
            dueMin,
            dueMax,
          )

          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }

          return formatMcpResponse(JSON.stringify(tasks, null, 2));
        } catch (error) {
          console.warn("[Calendar Tasks API] Failed to get tasks:", error);
          const errorMsg = `[Calendar Tasks API] Failed to get tasks: ${
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
          return formatMcpResponse("Failed to get tasks")
        }
      }
    );
    server.tool(
      "create_google_task_list",
      "Create a new task list",
      {
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          ),
        title: z
          .string()
      },
      async ({ log_message, title }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "create_google_task_list";

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
            arguments: { title },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP[toolName];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            `[MCP Auth] Missing required scope for ${toolName}`
          );
          const errorMsg =
            `Access denied: Missing required scopes ${TOOL_SCOPE_MAP[toolName]}`;
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
          const oAuth2Client = new google.auth.OAuth2();
          const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken;
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
          const tasksClient = google.tasks({ version: "v1", auth: oAuth2Client });
          const newTaskList = await insertTaskList(tasksClient, title)

          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }
          return formatMcpResponse(JSON.stringify(newTaskList, null, 2));
        } catch (error) {
          console.warn("[Calendar Tasks API] Failed to create task list:", error);
          const errorMsg = `[Calendar Tasks API] Failed to create task list: ${
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
          return formatMcpResponse("Failed to insert task")
        }
      }
    );
    server.tool(
      "insert_google_task",
      "Insert a new google task into a task list",
      {
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          ),
        tasklistId: z
          .string(),
        title: z
          .string(),
        description: z
          .string(),
        due: z
          .string()
          .datetime()
      },
      async ({ log_message, tasklistId, title, description, due }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "insert_google_task";

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
            arguments: { tasklistId, title, description, due },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP[toolName];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            `[MCP Auth] Missing required scope for ${toolName}`
          );
          const errorMsg =
            `Access denied: Missing required scopes ${TOOL_SCOPE_MAP[toolName]}`;
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
          const oAuth2Client = new google.auth.OAuth2();
          const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken;
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
          const tasksClient = google.tasks({ version: "v1", auth: oAuth2Client });
          const newTask = await insertTask(tasksClient, tasklistId, title, description, due)

          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }
          console.log(newTask)
          return formatMcpResponse(JSON.stringify(newTask, null, 2));
        } catch (error) {
          console.warn("[Calendar Tasks API] Failed to insert task:", error);
          const errorMsg = `[Calendar Tasks API] Failed to insert task: ${
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
          return formatMcpResponse("Failed to insert task")
        }
      }
    );
    server.tool(
      "update_google_task",
      "Update an existing google task",
      {
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool (e.g., 'Check user preferences', 'Save new task')"
          ),
        tasklistId: z
          .string(),
        taskId: z
          .string(),
        title: z
          .string()
          .optional(),
        description: z
          .string()
          .optional(),
        status: z
          .enum(["needsAction", "completed"])
          .optional(),
        due: z
          .string()
          .datetime()
          .optional(),
      },
      async (
        {
          log_message,
          tasklistId,
          taskId,
          title,
          description,
          status,
          due
        },
        extra
      ) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "update_google_task";

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
            arguments: { tasklistId, taskId, title, description, status, due },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        // Check scope authorization
        const requiredScopes = TOOL_SCOPE_MAP[toolName];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(
            `[MCP Auth] Missing required scope for ${toolName}`
          );
          const errorMsg =
            `Access denied: Missing required scopes ${TOOL_SCOPE_MAP[toolName]}`;
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
          const oAuth2Client = new google.auth.OAuth2();
          const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken;
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
          const tasksClient = google.tasks({ version: "v1", auth: oAuth2Client });
          const newTask = await updateTask(tasksClient, taskId, tasklistId, title, description, status, due)
          if (newTask.status === "completed") {
            clearTasks(tasksClient, tasklistId)
          }
          // Log success
          if (workflowRunId) {
            await logToolCall(workflowRunId, toolCallId, {
              status: "success",
              updatedAt: new Date(),
            }).catch((err) =>
              console.error("Failed to log tool call success:", err)
            );
          }
          
          return formatMcpResponse(JSON.stringify(newTask, null, 2));
        } catch (error) {
          console.warn("[Calendar Tasks API] Failed to update task:", error);
          const errorMsg = `[Calendar Tasks API] Failed to update task: ${
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
          return formatMcpResponse("Failed to insert task")
        }
      }
    );
    server.tool(
      "get_workplans",
      "Retrieve cached workplans for the user's upcoming calendar events",
      {
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool"
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(WORKPLAN_MAX_EVENT_LIMIT)
          .optional()
          .describe("Maximum number of upcoming events to include"),
        days: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Calendar lookahead window in days (default: 7)"),
        eventId: z
          .string()
          .min(1)
          .optional()
          .describe("Filter by specific calendar event ID (exact match)"),
        eventTitle: z
          .string()
          .min(1)
          .optional()
          .describe("Filter by event title (case-insensitive substring match)"),
      },
      async ({ log_message, limit, days, eventId, eventTitle }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "get_workplans";

        const displayInfo = log_message
          ? { displayTitle: log_message, displayDescription: "" }
          : getDefaultToolDisplayInfo(toolName);

        if (workflowRunId) {
          await logToolCall(workflowRunId, toolCallId, {
            toolName,
            displayTitle: displayInfo.displayTitle,
            displayDescription: displayInfo.displayDescription,
            arguments: { limit, days, eventId, eventTitle },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        const requiredScopes = TOOL_SCOPE_MAP[toolName];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(`[MCP Auth] Missing required scope for ${toolName}`);
          const errorMsg = `Access denied: Missing required scope ${requiredScopes.join(", ")}`;
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
          if (!userId) {
            const errorMsg = "User ID is required";
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

          const cappedLimit = limit ?? WORKPLAN_DEFAULT_EVENT_LIMIT;
          const normalizedEventId = eventId?.trim();
          const normalizedEventTitle = eventTitle?.trim().toLowerCase();

          const matchesFilters = (title?: string | null, id?: string) => {
            if (normalizedEventId && id && normalizedEventId !== id) {
              return false;
            }
            if (normalizedEventTitle) {
              const compare = title?.toLowerCase() ?? "";
              if (!compare.includes(normalizedEventTitle)) {
                return false;
              }
            }
            return true;
          };

          const cachedPlans = await listWorkplans(
            userId,
            Math.max(cappedLimit * 3, WORKPLAN_MAX_EVENT_LIMIT)
          );
          const cachedMatches = cachedPlans
            .filter((plan) => matchesFilters(plan.event.title, plan.eventId))
            .slice(0, cappedLimit);

          const result = {
            workplans: cachedMatches.map((plan) => ({
              event: {
                id: plan.eventId,
                ...plan.event,
              },
              steps: plan.steps,
              status: plan.status,
              lastGeneratedAt:
                plan.lastGeneratedAt instanceof Date
                  ? plan.lastGeneratedAt.toISOString()
                  : plan.lastGeneratedAt,
              source: plan.source,
              role: plan.role ?? null,
            })),
          };

          const usedEventIds = new Set<string>(
            cachedMatches.map((p) => p.eventId)
          );

          const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken;

          if (
            googleAccessToken &&
            typeof googleAccessToken === "string" &&
            result.workplans.length < cappedLimit
          ) {
            const windowDays = days ?? 7;
            const fetchLimit =
              normalizedEventId || normalizedEventTitle
                ? cappedLimit * 3
                : cappedLimit;

            const calendarItems = await fetchUpcomingCalendarItems(
              googleAccessToken,
              windowDays,
              fetchLimit
            );

            const filteredItems = calendarItems.filter((item) =>
              matchesFilters(item.title, item.id ?? undefined)
            );

            for (const item of filteredItems) {
              if (result.workplans.length >= cappedLimit) break;
              if (item.id && usedEventIds.has(item.id)) continue;

              const snapshot = normalizeEventSnapshot({
                title: item.title,
                start: item.start,
                end: item.end,
                location: item.location,
                description: item.description,
              });

              try {
                const workplan = await ensureWorkplanForEvent({
                  userId,
                  eventId: item.id,
                  event: snapshot,
                } satisfies WorkplanGenerationInput);

                result.workplans.push({
                  event: {
                    id: item.id,
                    ...snapshot,
                  },
                  steps: workplan.steps,
                  status: workplan.status,
                  lastGeneratedAt:
                    workplan.lastGeneratedAt instanceof Date
                      ? workplan.lastGeneratedAt.toISOString()
                      : workplan.lastGeneratedAt,
                  source: workplan.source,
                  role: workplan.role ?? null,
                });
                if (item.id) usedEventIds.add(item.id);
              } catch (error) {
                console.error("[MCP get_workplans] Failed to ensure plan:", error);
              }
            }
          }

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
          console.error("[MCP get_workplans] Error:", error);
          const errorMsg = `Failed to get workplans: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
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
      "update_workplan",
      "Update or regenerate a workplan for a specific event",
      {
        log_message: z
          .string()
          .optional()
          .describe(
            "Human-readable description of what you're doing with this tool"
          ),
        eventId: z.string().min(1).describe("Calendar event ID"),
        event: z
          .object({
            title: z.string().min(1),
            start: z.string().optional().nullable(),
            end: z.string().optional().nullable(),
            location: z.string().optional().nullable(),
            description: z.string().optional().nullable(),
          })
          .describe("Event details"),
        userRole: z
          .string()
          .optional()
          .describe("User's role for this event (e.g., 'organizer', 'attendee')"),
      },
      async ({ log_message, eventId, event, userRole }, extra) => {
        const toolCallId = new ObjectId().toString();
        const workflowRunId = extra?.authInfo?.extra?.workflowRunId as
          | string
          | undefined;
        const toolName = "update_workplan";

        const displayInfo = log_message
          ? { displayTitle: log_message, displayDescription: "" }
          : getDefaultToolDisplayInfo(toolName);

        if (workflowRunId) {
          await logToolCall(workflowRunId, toolCallId, {
            toolName,
            displayTitle: displayInfo.displayTitle,
            displayDescription: displayInfo.displayDescription,
            arguments: { eventId, event, userRole },
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }).catch((err) =>
            console.error("Failed to log tool call start:", err)
          );
        }

        const requiredScopes = TOOL_SCOPE_MAP[toolName];
        if (!userHasScope(requiredScopes, extra?.authInfo)) {
          console.error(`[MCP Auth] Missing required scope for ${toolName}`);
          const errorMsg = `Access denied: Missing required scope ${requiredScopes.join(", ")}`;
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
          if (!userId) {
            const errorMsg = "User ID is required";
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

          const snapshot = normalizeEventSnapshot(event);
          const roleHint = userRole?.trim();

          const workplan = await regenerateWorkplanForEvent({
            userId,
            eventId,
            event: snapshot,
            roleHint,
          } satisfies WorkplanGenerationInput);

          const result = {
            event: {
              id: eventId,
              ...snapshot,
            },
            steps: workplan.steps,
            status: workplan.status,
            lastGeneratedAt:
              workplan.lastGeneratedAt instanceof Date
                ? workplan.lastGeneratedAt.toISOString()
                : workplan.lastGeneratedAt,
            role: workplan.role ?? null,
          };

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
          console.error("[MCP update_workplan] Error:", error);
          const errorMsg = `Failed to update workplan: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
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
          tool_args: ToolSchemas[tool.name],
        },
        async (args, extra) => {
          const toolCallId = new ObjectId().toString();
          const authInfo = extra?.authInfo as AuthInfo | undefined;
          if (!authInfo) {
            console.error("[MCP] Auth info is required", { args, extra });
            return formatMcpResponse("Auth info is required");
          }
          const workflowRunId = authInfo?.extra?.workflowRunId as
            | string
            | undefined;
          const toolName = tool.name;

          console.log("[MCP] Tool called", {
            toolName,
            args,
            extra,
            workflowRunId,
          });

          const { log_message, tool_args } = args;

          const displayInfo = log_message
            ? { displayTitle: log_message, displayDescription: "" }
            : getDefaultToolDisplayInfo(toolName);

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
      // Available scopes: read:user-context, write:user-context, calendar:read, calendar:write, tasks:read, tasks:write
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
        get_google_task_lists: {
          description: "Get all google task lists (requires: tasks:read)"
        },
        get_google_tasks: {
          description: "Get google tasks in given timeframe (requires: tasks:read)"
        },
        create_google_task_list: {
          description: "Create a new google task list (requires tasks:write)"
        },
        insert_google_task: {
          description: "Insert a new google task (requires: tasks:write)"
        },
        update_google_task: {
          description: "Update an existing google task: (requires: task:write)"
        },
        get_workplans: {
          description: "Retrieve cached workplans for upcoming calendar events (requires: read:user-context)"
        },
        update_workplan: {
          description: "Update or regenerate a workplan for a specific event (requires: write:user-context)"
        },
        ...ToolRegistry.getToolsWithSchemas().reduce((rest, tool) => {
          const scopes = TOOL_SCOPE_MAP[tool.name] || [];
          const scopeStr =
            scopes.length > 0 ? ` (requires: ${scopes.join(", ")})` : "";
          return {
            ...rest,
            [tool.name]: {
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
      "tasks:read",
      "tasks:write",
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
      userScopes.push("calendar:read", "calendar:write", "tasks:read", "tasks:write");
    }
  }

  console.log("[MCP Auth] Verified token", {
    userId: payload.userId,
    hasGoogleAccessToken: !!payload.googleAccessToken,
    workflowRunId: payload.workflowRunId,
    tokenScopes: payload.scopes,
    assignedScopes: JSON.stringify(userScopes),
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
