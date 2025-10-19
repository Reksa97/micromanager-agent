import { tool, Tool } from "@openai/agents";
import { z } from "zod";

import {
  WORKPLAN_DEFAULT_EVENT_LIMIT,
  WORKPLAN_MAX_EVENT_LIMIT,
} from "@/lib/constants";
import { fetchUpcomingCalendarItems } from "@/lib/calendar";
import {
  ensureWorkplanForEvent,
  WorkplanGenerationInput,
} from "@/lib/workplan-generator";
import {
  listWorkplans,
  normaliseEventSnapshot,
  StoredWorkplan,
} from "@/lib/workplans";
import { getGoogleAccessToken } from "@/lib/google-tokens";

type ToolResult = {
  workplans: Array<{
    event: {
      id: string;
      title: string;
      start?: string | null;
      end?: string | null;
      location?: string | null;
      description?: string | null;
    };
    steps: string[];
    status: string;
    lastGeneratedAt?: string;
  }>;
  warning?: string;
};

export const createWorkplanTool = (userId: string): Tool =>
  tool({
    name: "get_workplans",
    description:
      "Retrieve cached workplans for the user's upcoming calendar events. Use this to answer questions about event preparation or next steps.",
    strict: true,
    parameters: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(WORKPLAN_MAX_EVENT_LIMIT)
        .nullable()
        .optional()
        .describe(
          "Maximum number of upcoming events to include (default based on product setting)."
        ),
      days: z
        .number()
        .int()
        .min(1)
        .max(60)
        .nullable()
        .optional()
        .describe(
          "Calendar lookahead window in days. Defaults to the same value used in the UI."
        ),
    }),
    execute: async ({ limit, days }): Promise<string> => {
      const result: ToolResult = { workplans: [] };

      const normalizedLimit =
        typeof limit === "number" ? limit : undefined;
      const cappedLimit =
        normalizedLimit ??
        Math.min(WORKPLAN_DEFAULT_EVENT_LIMIT, WORKPLAN_MAX_EVENT_LIMIT);
      const accessToken = await getGoogleAccessToken(userId);

      if (!accessToken) {
        const cached = await listWorkplans(userId, cappedLimit);
        if (!cached.length) {
          result.warning = "Google account is not linked.";
          return JSON.stringify(result);
        }

        result.warning =
          "Google account is not linked; returning previously cached workplans.";
        result.workplans = cached
          .slice(0, cappedLimit)
          .map((plan) => serialiseStoredWorkplan(plan));
        return JSON.stringify(result);
      }

      const windowDays =
        typeof days === "number" ? days : UPCOMING_DAYS_DEFAULT;

      const calendarItems = await fetchUpcomingCalendarItems(
        accessToken,
        windowDays,
        cappedLimit
      );

      for (const item of calendarItems) {
        const snapshot = normaliseEventSnapshot({
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
            lastGeneratedAt: workplan.lastGeneratedAt?.toISOString?.() ??
              (workplan.lastGeneratedAt instanceof Date
                ? workplan.lastGeneratedAt.toISOString()
                : undefined),
          });
        } catch (error) {
          console.error("[Workplan Tool] Failed to ensure plan:", error);
        }
      }

      if (result.workplans.length === 0 && !result.warning) {
        result.warning = "No upcoming events with workplans found.";
      }

      return JSON.stringify(result);
    },
  });

const UPCOMING_DAYS_DEFAULT = 7;

function serialiseStoredWorkplan(plan: StoredWorkplan) {
  return {
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
  };
}
