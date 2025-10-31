import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  regenerateWorkplanForEvent,
  WorkplanGenerationInput,
} from "@/lib/workplan-generator";
import { normalizeEventSnapshot } from "@/lib/workplans";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getGoogleAccessToken } from "@/lib/google-tokens";

const requestSchema = z.object({
  event: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    start: z.string().optional().nullable(),
    end: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
  }),
  userRole: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
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

  const payload = await request.json().catch(() => null);
  const parseResult = requestSchema.safeParse(payload);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  try {
    const snapshot = normalizeEventSnapshot(parseResult.data.event);
    const roleHint = parseResult.data.userRole?.trim();
    const workplan = await regenerateWorkplanForEvent({
      userId: userId,
      eventId: parseResult.data.event.id,
      event: snapshot,
      roleHint,
    } satisfies WorkplanGenerationInput);

    return NextResponse.json({
      event: {
        id: parseResult.data.event.id,
        ...snapshot,
      },
      steps: workplan.steps,
      status: workplan.status,
      lastGeneratedAt:
        workplan.lastGeneratedAt instanceof Date
          ? workplan.lastGeneratedAt.toISOString()
          : workplan.lastGeneratedAt,
      role: workplan.role ?? null,
    });
  } catch (error) {
    console.error("[Workplan Regenerate API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to regenerate workplan",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
