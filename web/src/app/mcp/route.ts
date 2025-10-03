import {
  getUserContextDocument,
  updateUserContextDocument,
  UserContextDocument,
} from "@/lib/user-context";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

const formatMcpResponse = (response: string): CallToolResult => ({
  content: [{ type: "text", text: response }],
});

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
    },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["read:user-context"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
