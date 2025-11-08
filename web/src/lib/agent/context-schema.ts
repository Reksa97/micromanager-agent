/**
 * Structured User Context Schema for Micromanager Agent
 *
 * This schema defines the canonical structure for user context,
 * preventing context overflow and improving agent efficiency.
 */

export interface UserPreferences {
  workingHours?: {
    start: string; // e.g., "09:00"
    end: string;   // e.g., "17:00"
  };
  meetingPreferences?: {
    preferredDuration: number; // minutes
    bufferBefore: number;      // minutes
    bufferAfter: number;       // minutes
  };
  timezone?: string; // e.g., "Europe/Helsinki"
  communicationStyle?: "formal" | "casual" | "playful";
  languagePreference?: string; // e.g., "en", "fi"
}

export interface UserPatterns {
  // Track when user is most active for smart nudging
  activeHours?: number[]; // [9, 10, 14, 15, 20] - hours when user responds
  lastInteraction?: string; // ISO timestamp
  averageResponseTime?: number; // hours
  consecutiveNonResponses?: number; // for nudge escalation
}

export interface ImportantContext {
  // Current focus areas (max 3-5 items to prevent overflow)
  currentFocus?: string[]; // ["Project X launch", "Quarterly review prep"]
  upcomingDeadlines?: Array<{
    task: string;
    deadline: string; // ISO timestamp
    priority: "high" | "medium" | "low";
  }>;
  recentDecisions?: Array<{
    decision: string;
    context: string;
    timestamp: string;
  }>;
}

export interface StructuredUserContext {
  preferences?: UserPreferences;
  patterns?: UserPatterns;
  importantContext?: ImportantContext;

  // Free-form notes for agent memory (keep minimal!)
  notes?: string[];

  // Last cleanup timestamp
  lastCleanup?: string;
}

/**
 * Context cleaning rules:
 * - Remove entries older than 30 days from notes
 * - Keep only 3 most recent decisions
 * - Remove completed deadlines
 * - Update patterns based on interaction history
 */
export const CONTEXT_LIMITS = {
  MAX_NOTES: 10,
  MAX_DECISIONS: 3,
  MAX_CURRENT_FOCUS: 5,
  MAX_UPCOMING_DEADLINES: 10,
  CLEANUP_INTERVAL_DAYS: 7,
  NOTE_MAX_AGE_DAYS: 30,
} as const;

/**
 * Helper to determine if context needs cleanup
 */
export function needsCleanup(context: StructuredUserContext): boolean {
  const lastCleanup = context.lastCleanup
    ? new Date(context.lastCleanup)
    : new Date(0);
  const daysSinceCleanup =
    (Date.now() - lastCleanup.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceCleanup >= CONTEXT_LIMITS.CLEANUP_INTERVAL_DAYS;
}

/**
 * Generate agent instructions for context usage
 */
export const CONTEXT_USAGE_INSTRUCTIONS = `
## User Context Structure

The user context follows a structured schema to prevent overflow:

### 1. preferences
Store user's work patterns and preferences:
- workingHours: When they typically work
- meetingPreferences: Default meeting settings
- timezone, communicationStyle, languagePreference

### 2. patterns (AUTO-MANAGED)
System tracks:
- activeHours: When user is most responsive
- lastInteraction: Last message timestamp
- consecutiveNonResponses: For progressive nudging

### 3. importantContext
Current priorities (keep MINIMAL):
- currentFocus: Max ${CONTEXT_LIMITS.MAX_CURRENT_FOCUS} items - active projects/goals
- upcomingDeadlines: Max ${CONTEXT_LIMITS.MAX_UPCOMING_DEADLINES} critical deadlines
- recentDecisions: Max ${CONTEXT_LIMITS.MAX_DECISIONS} decisions for continuity

### 4. notes
Free-form memory (use sparingly):
- Max ${CONTEXT_LIMITS.MAX_NOTES} notes
- Auto-cleanup after ${CONTEXT_LIMITS.NOTE_MAX_AGE_DAYS} days

## Context Usage Rules

1. **Read context FIRST** every interaction
2. **Update patterns** after each user message (lastInteraction, activeHours)
3. **Keep currentFocus updated** - remove completed projects
4. **Clean up deadlines** - remove past/completed items
5. **Be selective with notes** - only store truly important insights
6. **Run cleanup check** if lastCleanup > ${CONTEXT_LIMITS.CLEANUP_INTERVAL_DAYS} days

Example update:
\`\`\`json
{
  "contextUpdates": [
    {
      "path": "patterns.lastInteraction",
      "value": "2025-11-08T10:30:00Z"
    },
    {
      "path": "importantContext.currentFocus",
      "value": ["Q4 Report", "Team Onboarding"]
    }
  ]
}
\`\`\`
`;
