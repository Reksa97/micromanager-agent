import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { fetchUpcomingCalendarItems } from "@/lib/calendar";
import {
  ensureWorkplanForEvent,
  WorkplanGenerationInput,
} from "@/lib/workplan-generator";
import {
  normalizeEventSnapshot,
  WorkplanEventSnapshot,
  listWorkplans,
} from "@/lib/workplans";
import {
  WORKPLAN_DEFAULT_EVENT_LIMIT,
  WORKPLAN_MAX_EVENT_LIMIT,
} from "@/lib/constants";
import { env } from "@/env";
import { jwtVerify } from "jose";
import { getGoogleAccessToken } from "@/lib/google-tokens";

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
  // Try NextAuth session first
  const session = await auth();
  let userId = session?.user?.id;
  let googleAccessToken = session?.googleAccessToken;

  // If no NextAuth session, check for Telegram JWT
  if (!userId) {
    try {
      let token = request.cookies.get("telegram-auth-token")?.value;
      const authHeader = request.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      if (token) {
        const { payload } = await jwtVerify(token, env.JWT_SECRET);
        if (typeof payload.sub === "string") {
          userId = payload.sub;
          googleAccessToken = await getGoogleAccessToken(userId);
        }
      }
    } catch (error) {
      console.error("[Workplan API] Failed to verify Telegram token", error);
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized - valid session required" },
      { status: 401 }
    );
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

  if (!googleAccessToken) {
    const cached = await listWorkplans(userId, limit);
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
        source: plan.source,
        role: plan.role ?? null,
      })),
    });
  }

  try {
    const calendarItems = await fetchUpcomingCalendarItems(
      googleAccessToken,
      days,
      limit
    );

    const items = [];
    for (const item of calendarItems) {
      try {
        const snapshot: WorkplanEventSnapshot = normalizeEventSnapshot({
          title: item.title,
          start: item.start,
          end: item.end,
          location: item.location,
          description: item.description,
        });

        const workplan = await ensureWorkplanForEvent({
          userId,
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
          source: workplan.source,
          role: workplan.role ?? null,
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
          role: null,
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
