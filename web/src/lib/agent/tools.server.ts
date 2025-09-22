import { tool } from "@openai/agents";
import { z } from "zod";
import {
  getUserContextDocument,
  updateUserContextDocument,
} from "../user-context";

export const getContextTool = (userId: string) =>
  tool({
    name: "get_user_context",
    description: "Get the user context",
    parameters: z.object({}),
    async execute() {
      try {
        const userContextDoc = await getUserContextDocument(userId);
        console.log("User context fetched", {
          userId,
          userContextDoc,
        });
        return JSON.stringify(userContextDoc.data, null, 2);
      } catch (error) {
        console.error("Failed to get user context", error);
        return `Failed to get user context: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    },
  });

export const updateContextTool = (userId: string) =>
  tool({
    name: "update_user_context",
    description: "Update the user context",
    parameters: z.object({
      contextUpdates: z.array(
        z.object({ path: z.string(), value: z.string() })
      ),
    }),
    async execute({ contextUpdates }) {
      try {
        const newContext = await updateUserContextDocument(
          userId,
          contextUpdates
        );
        console.log("User context updated", {
          userId,
          contextUpdates,
          newContext,
        });
        return `User context updated with ${contextUpdates.length} updates`;
      } catch (error) {
        console.error("Failed to update user context", error);
        return `Failed to update user context: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    },
  });
