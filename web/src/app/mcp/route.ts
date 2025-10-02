import {
  getUserContextDocument,
  updateUserContextDocument,
  UserContextDocument,
} from "@/lib/user-context";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const formatMcpResponse = (response: string): CallToolResult => ({
  content: [{ type: "text", text: response }],
});

const parseExtra = (
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => {
  const userId = extra.requestInfo?.headers["user-id"] as string;
  if (!userId) {
    console.error("User ID not in headers", {
      headers: extra.requestInfo?.headers,
    });
    throw new Error("User ID not in headers");
  }
  return { userId };
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
        try {
          const { userId } = parseExtra(extra);
          console.log("get_user_context", { getAllData, userId });
          if (!userId) {
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
          const { userId } = parseExtra(extra);
          console.log("update_user_context", {
            contextUpdates,
            contextDeletes,
            userId,
          });
          if (!userId) {
            console.error("User ID is required", { extra });
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

export { handler as GET, handler as POST, handler as DELETE };
