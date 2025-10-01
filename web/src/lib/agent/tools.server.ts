import { hostedMcpTool, Tool, tool } from "@openai/agents";
import { z } from "zod";
import {
  getUserContextDocument,
  updateUserContextDocument,
} from "../user-context";
import { getWeatherTool } from "./tools";
import { Session } from "next-auth";
import { createEvent } from "../google-calendar";
import { auth } from "@/auth";

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

export const createCalendarEventTool = (googleAccessToken: string) => 
  tool({
    name: "create_calendar_event",
    description: "Create a new calendar event using Google Calendar API",
    parameters: z.object({
      event: z.object({
        summary: z.string(),
        location: z.string().nullable(),
        description: z.string().nullable(),
        start: z.object({
          dateTime: z.string().regex(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
            "Must be in format YYYY-MM-DDTHH:mm:ss without timezone offset"
          ),
          timeZone: z.string(),
        }),
        end: z.object({
          dateTime: z.string().regex(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
            "Must be in format YYYY-MM-DDTHH:mm:ss without timezone offset"
          ),
          timeZone: z.string(),
        }),
        recurrence: z.array(z.string().regex(
          /^RRULE:(?:[^;]+=[^;]+;?)+$/i, 
          "Invalid RRULE format. Must start with 'RRULE:' and follow RFC 5545 (e.g., RRULE:FREQ=DAILY;COUNT=2)."
        )).nullable(),
        attendees: z.array(
          z.object({email: z.string().email()}) 
        ),
        reminders: z.object({
          useDefault: z.boolean(),
          overrides: z.array(
            z.object({ method: z.enum(['email', 'popup']), minutes: z.number().gt(0).lt(40320) }),
          ).max(5),
        }),
      })
    }),
    async execute({ event }) {
      try {
        const link = await createEvent(googleAccessToken, event)
        return `A new event was created in the google calendar. Link to the event: ${link}`
      } catch (error) {
        console.log('Failed to create a new calendar event', error);
        return `Failed to create a new calendar event: ${
          error instanceof Error ? error.message : "Unkown error"
        }`;
      }
    }
  });

export const getBackendTools = (userId: string, googleAccessToken: string | null | undefined = undefined) => {
  const tools: Tool[] = [
    getWeatherTool,
    // getContextTool(userId), Context is included in the system prompt
    updateContextTool(userId),
  ];
  if (googleAccessToken) {
    console.log("Adding Google Calendar tool with authenticated user's token");
    tools.push(
      hostedMcpTool({
        serverLabel: "google_calendar",
        connectorId: "connector_googlecalendar",
        requireApproval: "never",
        authorization: googleAccessToken,
      })
    );
    tools.push(createCalendarEventTool(googleAccessToken));
  } else if (process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING) {
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
    tools.push(createCalendarEventTool(process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING));
  }
  return tools;
};
