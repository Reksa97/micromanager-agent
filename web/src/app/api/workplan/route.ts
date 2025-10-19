import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { fetchUpcomingCalendarItems } from "@/lib/calendar";
import {
  ensureWorkplanForEvent,
  WorkplanGenerationInput,
} from "@/lib/workplan-generator";
import {
  normaliseEventSnapshot,
  WorkplanEventSnapshot,
  listWorkplans,
} from "@/lib/workplans";
import {
  WORKPLAN_DEFAULT_EVENT_LIMIT,
  WORKPLAN_MAX_EVENT_LIMIT,
} from "@/lib/constants";

const querySchema = z.object({
  days: z
    .string()
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(60))
    .optional(),
  limit: z
    .string()
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(WORKPLAN_MAX_EVENT_LIMIT))
    .optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    days: url.searchParams.get("days") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  const days = parseResult.success ? parseResult.data.days ?? 7 : 7;
  const limit = parseResult.success
    ? parseResult.data.limit ?? WORKPLAN_DEFAULT_EVENT_LIMIT
    : WORKPLAN_DEFAULT_EVENT_LIMIT;

  if (!session.googleAccessToken) {
    const cached = await listWorkplans(session.user.id, limit);
    return NextResponse.json({
      workplans: cached.map((plan) => ({
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
      })),
    });
  }

  try {
    const calendarItems = await fetchUpcomingCalendarItems(
      session.googleAccessToken,
      days,
      limit
    );

    const items = [];
    for (const item of calendarItems) {
      try {
        const snapshot: WorkplanEventSnapshot = normaliseEventSnapshot({
          title: item.title,
          start: item.start,
          end: item.end,
          location: item.location,
          description: item.description,
        });

        const workplan = await ensureWorkplanForEvent({
          userId: session.user.id,
          eventId: item.id,
          event: snapshot,
        } satisfies WorkplanGenerationInput);

        items.push({
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
        });
      } catch (error) {
        console.error("[Workplan API] Failed to ensure plan:", error);
        items.push({
          event: {
            id: item.id,
            title: item.title,
            start: item.start,
            end: item.end,
            location: item.location,
            description: item.description,
          },
          steps: [],
          status: "error" as const,
          error:
            error instanceof Error ? error.message : "Failed to generate plan",
        });
      }
    }

    return NextResponse.json({ workplans: items });
  } catch (error) {
    console.error("[Workplan API] Error:", error);
    return NextResponse.json(
      { error: "Failed to build workplans" },
      { status: 500 }
    );
  }
}
