import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { OpenAIAgent, runOpenAIAgent } from "@/lib/openai";
import { MODELS } from "@/lib/utils";

const bodySchema = z.object({
  event: z.object({
    id: z.string(),
    title: z.string(),
    start: z.string().optional(),
    end: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
  }),
  userRole: z.string().optional(), // Highest-priority role string (e.g., "volunteer lead")
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const evt = parsed.data.event;
  const userRole = (parsed.data.userRole?.trim() || "attendee").toLowerCase();

  const when = [evt.start, evt.end].filter(Boolean).join(" - ");
  const meta: string[] = [];
  if (when) meta.push(`When: ${when}`);
  if (evt.location) meta.push(`Location: ${evt.location}`);
  if (evt.description) meta.push(`Notes: ${evt.description}`);

  const instructions = `
  You are Micromanager, an operations assistant.
  If a user role is explicitly provided, use it.
  Otherwise, infer the most appropriate role for the user based on the event title, description, or task context.
  For example:
  - If the event involves cooking, assume the user is the cook.
  - If it involves cleaning or washing, assume the user is performing that task.
  - If it involves organizing or managing, assume the user is the organizer or manager.
  Produce a concise, practical, step-by-step work plan tailored to that role.
  Keep each step short and actionable.
  Output only the steps as a numbered list.
  `;

  const roleLine = `
  User role for this event: ${userRole || "to be inferred from context"}.
  If no explicit role is given, determine it logically from the event’s details, prioritizing the role of the person performing the main action.
  `;

  const prompt = [
    `Event: ${evt.title}`,
    ...meta,
    roleLine,
    "",
    "Return 6-10 steps, numbered, one per line.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const agent = new OpenAIAgent({
      name: "workplan",
      instructions,
      model: MODELS.text,
      tools: [],
    });

    const result = await runOpenAIAgent(agent, prompt);
    const text = result.finalOutput?.trim() ?? "";

    const steps = splitToSteps(text);
    return NextResponse.json({ steps });
  } catch (error) {
    console.error("[WorkPlan API] Error:", error);
    return NextResponse.json({ error: "Failed to generate plan" }, { status: 500 });
  }
}

function splitToSteps(text: string): string[] {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const cleaned = lines.map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim());
  return cleaned.slice(0, 12);
}
