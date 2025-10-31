import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  normalizeEventSnapshot,
  WorkplanEventSnapshot,
} from "@/lib/workplans";
import {
  ensureWorkplanForEvent,
  regenerateWorkplanForEvent,
} from "@/lib/workplan-generator";
import { jwtVerify } from "jose";
import { env } from "@/env";

const bodySchema = z.object({
  event: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    start: z.string().optional().nullable(),
    end: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
  }),
  userRole: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // Try NextAuth session first
  const session = await auth();
  let userId = session?.user?.id;

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
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const roleHint = parsed.data.userRole?.trim();
  const snapshot: WorkplanEventSnapshot = normalizeEventSnapshot(
    parsed.data.event
  );

  try {
    const workplan =
      parsed.data.userRole && parsed.data.userRole.trim().length > 0
        ? await regenerateWorkplanForEvent({
            userId: userId,
            eventId: parsed.data.event.id,
            event: snapshot,
            roleHint,
          })
        : await ensureWorkplanForEvent({
            userId: userId,
            eventId: parsed.data.event.id,
            event: snapshot,
            roleHint,
          });

    return NextResponse.json({
      steps: workplan.steps,
      status: workplan.status,
      lastGeneratedAt:
        workplan.lastGeneratedAt instanceof Date
          ? workplan.lastGeneratedAt.toISOString()
          : workplan.lastGeneratedAt,
      role: workplan.role ?? null,
    });
  } catch (error) {
    console.error("[WorkPlan API] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate plan" },
      { status: 500 }
    );
  }
}
