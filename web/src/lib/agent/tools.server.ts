import { hostedMcpTool, Tool, tool } from "@openai/agents";
import { z } from "zod";
import {
  getUserContextDocument,
  updateUserContextDocument,
} from "../user-context";
import { getWeatherTool } from "./tools";

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

export const getBackendTools = (userId: string) => {
  const tools: Tool[] = [
    getWeatherTool,
    // getContextTool(userId), Context is included in the system prompt
    updateContextTool(userId),
  ];

  if (process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING) {
    // https://platform.openai.com/docs/guides/tools-connectors-mcp
    // https://openai.github.io/openai-agents-js/guides/mcp/
    // Get your personal access token for Google Calendar
    // 1. Visit https://developers.google.com/oauthplayground/
    // 2. Input https://www.googleapis.com/auth/calendar.events as the required scope
    // 3. Grab the acccess token starting with "ya29."
    console.log("Adding Google Calendar tool with test token");
    tools.push(
      hostedMcpTool({
        serverLabel: "google_calendar",
        connectorId: "connector_googlecalendar",
        requireApproval: "never",
        authorization: process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING,
      })
    );
  }
  return tools;
};
