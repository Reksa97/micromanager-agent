import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  regenerateWorkplanForEvent,
  WorkplanGenerationInput,
} from "@/lib/workplan-generator";
import { normaliseEventSnapshot } from "@/lib/workplans";

const requestSchema = z.object({
  event: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    start: z.string().optional().nullable(),
    end: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
  }),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const snapshot = normaliseEventSnapshot(parseResult.data.event);
    const workplan = await regenerateWorkplanForEvent({
      userId: session.user.id,
      eventId: parseResult.data.event.id,
      event: snapshot,
    } satisfies WorkplanGenerationInput);

    return NextResponse.json({
      event: {
        id: parseResult.data.event.id,
        ...snapshot,
      },
      steps: workplan.steps,
      status: workplan.status,
      lastGeneratedAt: workplan.lastGeneratedAt,
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
