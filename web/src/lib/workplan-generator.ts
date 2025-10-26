import { OpenAIAgent, runOpenAIAgent } from "@/lib/openai";
import { MODELS } from "@/lib/utils";

import {
  WorkplanEventSnapshot,
  StoredWorkplan,
  findWorkplan,
  hasEventChanged,
  isWorkplanStale,
  normaliseEventSnapshot,
  saveWorkplan,
  markWorkplanStatus,
} from "@/lib/workplans";

export interface WorkplanGenerationInput {
  userId: string;
  eventId: string;
  event: WorkplanEventSnapshot;
  roleHint?: string;
}

export async function ensureWorkplanForEvent(
  input: WorkplanGenerationInput
): Promise<StoredWorkplan> {
  const snapshot = normaliseEventSnapshot(input.event);
  const existingRaw = await findWorkplan(input.userId, input.eventId);
  const existing = ensureRoleField(existingRaw);
  const normalizedRoleHint = normaliseRole(input.roleHint);
  const existingRole = existing?.role ?? null;
  const role = normalizedRoleHint ?? existingRole;
  const roleChanged =
    normalizedRoleHint !== null &&
    normalizedRoleHint !== existingRole &&
    existing?.source !== "manual";

  if (existing?.source === "manual") {
    return existing;
  }

  if (
    existing &&
    !hasEventChanged(existing, snapshot) &&
    !isWorkplanStale(existing) &&
    existing.steps.length > 0 &&
    !roleChanged
  ) {
    return existing;
  }

  try {
    const steps = await generateSteps({
      event: snapshot,
      roleHint: role ?? undefined,
    });
    return await saveWorkplan(
      input.userId,
      input.eventId,
      snapshot,
      steps,
      "ready",
      "auto",
      role
    );
  } catch (error) {
    console.error("[Workplan] Generation failed:", error);
    if (existing) {
      await markWorkplanStatus(input.userId, input.eventId, "error");
      return existing;
    }
    throw error;
  }
}

export async function regenerateWorkplanForEvent(
  input: WorkplanGenerationInput
): Promise<StoredWorkplan> {
  const snapshot = normaliseEventSnapshot(input.event);
  const existing = ensureRoleField(
    await findWorkplan(input.userId, input.eventId)
  );
  const role = normaliseRole(input.roleHint) ?? existing?.role ?? null;

  try {
    const steps = await generateSteps({
      event: snapshot,
      roleHint: role ?? undefined,
    });
    return await saveWorkplan(
      input.userId,
      input.eventId,
      snapshot,
      steps,
      "ready",
      "auto",
      role
    );
  } catch (error) {
    console.error("[Workplan] Regeneration failed:", error);
    await markWorkplanStatus(input.userId, input.eventId, "error");
    throw error;
  }
}

async function generateSteps({
  event,
  roleHint,
}: {
  event: WorkplanEventSnapshot;
  roleHint?: string;
}): Promise<string[]> {
  const instructions = `
You are Micromanager, an operations assistant.
Determine the user's most relevant hands-on role for this event based on the available details.
Produce a concise, practical, step-by-step work plan tailored to that role.
Keep each step short and actionable.
Output only the steps as a numbered list.`;

  const metaLines = [
    `Event: ${event.title}`,
    event.start ? `Start: ${event.start}` : null,
    event.end ? `End: ${event.end}` : null,
    event.location ? `Location: ${event.location}` : null,
    event.description ? `Notes: ${event.description}` : null,
    roleHint ? `Role hint: ${roleHint}` : null,
    "Return 6-10 steps, numbered, one per line.",
  ].filter(Boolean);

  const prompt = metaLines.join("\n");

  const agent = new OpenAIAgent({
    name: "workplan",
    instructions,
    model: MODELS.text,
    tools: [],
  });

  const result = await runOpenAIAgent(agent, prompt);
  const text = result.finalOutput?.trim() ?? "";
  const steps = splitToSteps(text);

  if (!steps.length) {
    throw new Error("No steps returned from model");
  }

  return steps;
}

function normaliseRole(role?: string | null): string | null {
  if (!role) return null;
  const trimmed = role.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureRoleField(
  plan: StoredWorkplan | null
): StoredWorkplan | null {
  if (!plan) return null;
  if (typeof plan.role === "undefined") {
    return { ...plan, role: null };
  }
  return plan;
}

function splitToSteps(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}
