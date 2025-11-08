/**
 * Progressive Nudge System
 *
 * Simplifies questions over time if user doesn't respond.
 * Adds playful teasing after 48h.
 */

import { getUserContextDocument, updateUserContextDocument } from "./user-context";
import type { StructuredUserContext } from "./agent/context-schema";

export interface NudgeLevel {
  level: number; // 0-5, where 5 is most complex
  tone: "professional" | "casual" | "playful" | "teasing" | "dramatic";
  hoursSinceLastInteraction: number;
}

/**
 * Calculate appropriate nudge level based on hours since last interaction
 */
export function calculateNudgeLevel(
  hoursSinceLastInteraction: number
): NudgeLevel {
  if (hoursSinceLastInteraction < 24) {
    return {
      level: 5,
      tone: "professional",
      hoursSinceLastInteraction,
    };
  } else if (hoursSinceLastInteraction < 48) {
    return {
      level: 4,
      tone: "casual",
      hoursSinceLastInteraction,
    };
  } else if (hoursSinceLastInteraction < 72) {
    return {
      level: 3,
      tone: "playful",
      hoursSinceLastInteraction,
    };
  } else if (hoursSinceLastInteraction < 96) {
    return {
      level: 2,
      tone: "teasing",
      hoursSinceLastInteraction,
    };
  } else if (hoursSinceLastInteraction < 168) {
    // 1 week
    return {
      level: 1,
      tone: "teasing",
      hoursSinceLastInteraction,
    };
  } else {
    return {
      level: 0,
      tone: "dramatic",
      hoursSinceLastInteraction,
    };
  }
}

/**
 * Generate progressive nudge message based on level and context
 * Now uses i18n support!
 */
export async function generateNudgeMessage(
  nudgeLevel: NudgeLevel,
  userId: string,
  upcomingEventSummary?: string
): Promise<string> {
  const { generateNudgeNotification, getUserLanguage } = await import(
    "@/lib/i18n/notifications"
  );

  const language = await getUserLanguage(userId);

  return generateNudgeNotification(
    nudgeLevel.level,
    language,
    upcomingEventSummary
  );
}

/**
 * Get hours since last user interaction
 */
export async function getHoursSinceLastInteraction(
  userId: string
): Promise<number> {
  try {
    const contextDoc = await getUserContextDocument(userId);
    const context = contextDoc.data as StructuredUserContext;

    const lastInteraction = context?.patterns?.lastInteraction;
    if (!lastInteraction) {
      // No previous interaction, consider it very old
      return 999;
    }

    const lastInteractionDate = new Date(lastInteraction);
    const now = new Date();
    const diffMs = now.getTime() - lastInteractionDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours;
  } catch (error) {
    console.error("Failed to get hours since last interaction:", error);
    return 999; // Default to very old if error
  }
}

/**
 * Update user's last interaction time and patterns
 */
export async function updateUserInteractionPatterns(
  userId: string
): Promise<void> {
  try {
    const now = new Date();
    const currentHour = now.getHours();

    // Get existing context to preserve active hours
    const contextDoc = await getUserContextDocument(userId);
    const context = contextDoc.data as StructuredUserContext;

    const existingActiveHours = context?.patterns?.activeHours || [];
    const updatedActiveHours = Array.from(
      new Set([...existingActiveHours, currentHour])
    ).sort((a, b) => a - b);

    await updateUserContextDocument(userId, [
      {
        path: "patterns.lastInteraction",
        value: now.toISOString(),
      },
      {
        path: "patterns.activeHours",
        value: updatedActiveHours,
      },
      {
        path: "patterns.consecutiveNonResponses",
        value: 0, // Reset counter on interaction
      },
    ]);
  } catch (error) {
    console.error("Failed to update user interaction patterns:", error);
  }
}

/**
 * Increment consecutive non-responses counter
 */
export async function incrementNonResponseCounter(
  userId: string
): Promise<number> {
  try {
    const contextDoc = await getUserContextDocument(userId);
    const context = contextDoc.data as StructuredUserContext;

    const currentCount = context?.patterns?.consecutiveNonResponses || 0;
    const newCount = currentCount + 1;

    await updateUserContextDocument(userId, [
      {
        path: "patterns.consecutiveNonResponses",
        value: newCount,
      },
    ]);

    return newCount;
  } catch (error) {
    console.error("Failed to increment non-response counter:", error);
    return 0;
  }
}

/**
 * Determine if user should receive a nudge
 * - Only nudge during active hours if known
 * - Don't nudge more than once per 24h
 * - Progressive delay between nudges
 */
export function shouldNudge(
  hoursSinceLastInteraction: number,
  activeHours?: number[],
  lastNudgeSentAt?: string
): boolean {
  // Don't nudge if less than 24h
  if (hoursSinceLastInteraction < 24) {
    return false;
  }

  // Check if we've sent a nudge recently (within last 24h)
  if (lastNudgeSentAt) {
    const lastNudge = new Date(lastNudgeSentAt);
    const hoursSinceLastNudge =
      (Date.now() - lastNudge.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastNudge < 24) {
      return false;
    }
  }

  // If we know active hours, only nudge during those times
  if (activeHours && activeHours.length > 0) {
    const currentHour = new Date().getHours();
    if (!activeHours.includes(currentHour)) {
      return false;
    }
  }

  return true;
}
