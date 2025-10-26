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
    source?: string;
    role?: string | null;
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
        .default(null)
        .describe(
          "Maximum number of upcoming events to include (default based on product setting)."
        ),
      days: z
        .number()
        .int()
        .min(1)
        .max(60)
        .nullable()
        .default(null)
        .describe(
          "Calendar lookahead window in days. Defaults to the same value used in the UI."
        ),
      eventId: z
        .string()
        .min(1)
        .nullable()
        .default(null)
        .describe("Filter by a specific calendar event identifier (exact match)."),
      eventTitle: z
        .string()
        .min(1)
        .nullable()
        .default(null)
        .describe(
          "Filter by event title (case-insensitive substring match)."
        ),
    }),
    execute: async ({ limit, days, eventId, eventTitle }): Promise<string> => {
      const result: ToolResult = { workplans: [] };

      const normalizedLimit = typeof limit === "number" ? limit : undefined;
      const cappedLimit =
        normalizedLimit ??
        Math.min(WORKPLAN_DEFAULT_EVENT_LIMIT, WORKPLAN_MAX_EVENT_LIMIT);
      const normalizedEventId =
        typeof eventId === "string" && eventId.trim().length > 0
          ? eventId.trim()
          : undefined;
      const normalizedEventTitle =
        typeof eventTitle === "string" && eventTitle.trim().length > 0
          ? eventTitle.trim().toLowerCase()
          : undefined;

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

      const usedEventIds = new Set<string>();
      for (const plan of cachedMatches) {
        result.workplans.push(serialiseStoredWorkplan(plan));
        if (plan.eventId) {
          usedEventIds.add(plan.eventId);
        }
      }

      const accessToken = await getGoogleAccessToken(userId);

      if (!accessToken) {
        if (!result.workplans.length) {
          result.warning =
            "Google account is not linked and no matching cached workplans were found.";
        } else {
          result.warning =
            "Google account is not linked; returning previously cached workplans.";
        }

        return JSON.stringify(result);
      }

      if (result.workplans.length >= cappedLimit) {
        return JSON.stringify(result);
      }

      const windowDays =
        typeof days === "number" ? days : UPCOMING_DAYS_DEFAULT;

      const fetchLimit =
        normalizedEventId || normalizedEventTitle
          ? cappedLimit * 3
          : cappedLimit;

      const calendarItems = await fetchUpcomingCalendarItems(
        accessToken,
        windowDays,
        fetchLimit
      );

      const filteredItems = calendarItems.filter((item) =>
        matchesFilters(item.title, item.id ?? undefined)
      );

      for (const item of filteredItems) {
        if (result.workplans.length >= cappedLimit) {
          break;
        }

        if (item.id && usedEventIds.has(item.id)) {
          continue;
        }

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
            source: workplan.source,
            role: workplan.role ?? null,
          });
          if (item.id) {
            usedEventIds.add(item.id);
          }
        } catch (error) {
          console.error("[Workplan Tool] Failed to ensure plan:", error);
        }
      }

      if (result.workplans.length === 0 && !result.warning) {
        result.warning = "No matching upcoming events with workplans found.";
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
    source: plan.source,
    role: plan.role ?? null,
  };
}
