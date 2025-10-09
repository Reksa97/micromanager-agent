import {
  getUserContextDocument,
  updateUserContextDocument,
  UserContextDocument,
} from "@/lib/user-context";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { ToolRegistry, ToolSchemas } from "@cocal/google-calendar-mcp/src/tools/registry"
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
  "get-current-time": GetCurrentTimeHandler
}

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
      "Update the user context or ",
      {
        contextUpdates: z
          .array(z.object({ path: z.string(), value: z.string() }))
          .optional(),
        contextDeletes: z.array(z.string()).optional(),
      },
      async ({ contextUpdates, contextDeletes }, extra) => {
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
    
    ToolRegistry.getToolsWithSchemas().forEach(tool => {
      server.registerTool(
        tool.name, 
        {
          description: tool.description,
          inputSchema: ToolRegistry.extractSchemaShape(ToolSchemas[tool.name]),
        },
        async (args, extra) => { 
          try {
            const oAuth2Client = new OAuth2Client({
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET
            });

            const googleAccessToken = extra?.authInfo?.extra?.googleAccessToken

            if (!googleAccessToken || typeof googleAccessToken !== "string") {
              console.log("Missing google access token")
              return formatMcpResponse("Missing Google access token");
            }
            

            oAuth2Client.setCredentials({ access_token: googleAccessToken });
            const result = await new calendarToolHandlers[tool.name]().runTool(args, oAuth2Client)
            return formatMcpResponse(
              JSON.stringify(result, null, 2)
            )
          } catch (error) {
            console.error("Failed ", error);
            return formatMcpResponse(
              `Failed to invoke ${tool.name}: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }
    )
    })
  },
  {
    capabilities: {
      tools: {
        get_user_context: {
          description: "Get the user context",
        },
        update_user_context: {
          description: "Update the user context",
        },
        ...ToolRegistry.getToolsWithSchemas().reduce((rest, tool) => ({...rest,
          [tool.name.replace('-', '_')]: { description: tool.description }
        }))
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
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) {
    console.error("Bearer token is required", { headers: req.headers });
    return undefined;
  }

  const userId = req.headers.get("user-id");
  if (!userId) {
    // TODO don't log sensitive information
    console.error("User ID is required", { headers: req.headers });
    return undefined;
  }

  const googleAccessToken = req.headers.get("google-access-token");
  if (!googleAccessToken) {
    // TODO don't log sensitive information
    console.error("Google access token is required", { headers: req.headers });
    return undefined;
  }

  const isValid = bearerToken.startsWith("__TEST_VALUE__");
  if (!isValid) {
    // TODO don't log sensitive information
    console.error("Invalid bearer token", { bearerToken });
    return undefined;
  }
  return {
    token: bearerToken,
    scopes: ["read:user-context", "write:user-context"],
    clientId: userId,
    extra: {
      // Optional extra information
      googleAccessToken: googleAccessToken,
    },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["read:user-context"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
