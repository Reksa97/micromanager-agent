import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  normaliseEventSnapshot,
  WorkplanEventSnapshot,
} from "@/lib/workplans";
import {
  ensureWorkplanForEvent,
  regenerateWorkplanForEvent,
} from "@/lib/workplan-generator";

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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const snapshot: WorkplanEventSnapshot = normaliseEventSnapshot(
    parsed.data.event
  );

  try {
    const workplan =
      parsed.data.userRole && parsed.data.userRole.trim().length > 0
        ? await regenerateWorkplanForEvent({
            userId: session.user.id,
            eventId: parsed.data.event.id,
            event: snapshot,
            roleHint,
          })
        : await ensureWorkplanForEvent({
            userId: session.user.id,
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
