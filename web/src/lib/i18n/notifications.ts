/**
 * Notification Templates with Language Support
 *
 * Supports: English (default), Finnish
 */

export type SupportedLanguage = "en" | "fi";

export interface GitHubPRNotification {
  action: "opened" | "ready_for_review" | "merged" | "closed";
  prNumber: number;
  prTitle: string;
  repoFullName: string;
  author: string;
  baseRef: string;
  headRef: string;
  prUrl: string;
}

export interface NudgeNotification {
  level: number; // 0-5
  upcomingEventSummary?: string;
}

/**
 * GitHub PR notification templates
 */
const githubPRTemplates: Record<
  SupportedLanguage,
  Record<string, (data: GitHubPRNotification) => string>
> = {
  en: {
    opened: (data) =>
      `🆕 New PR opened in ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n` +
      `by @${data.author}\n` +
      `${data.baseRef} ← ${data.headRef}\n\n` +
      `[View PR](${data.prUrl})`,

    ready_for_review: (data) =>
      `✅ PR ready for review in ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n\n` +
      `[View PR](${data.prUrl})`,

    merged: (data) =>
      `🎉 PR merged in ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n\n` +
      `[View PR](${data.prUrl})`,

    closed: (data) =>
      `❌ PR closed in ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n\n` +
      `[View PR](${data.prUrl})`,
  },

  fi: {
    opened: (data) =>
      `🆕 Uusi PR avattu projektissa ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n` +
      `tekijä: @${data.author}\n` +
      `${data.baseRef} ← ${data.headRef}\n\n` +
      `[Katso PR](${data.prUrl})`,

    ready_for_review: (data) =>
      `✅ PR valmis tarkasteltavaksi projektissa ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n\n` +
      `[Katso PR](${data.prUrl})`,

    merged: (data) =>
      `🎉 PR yhdistetty projektissa ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n\n` +
      `[Katso PR](${data.prUrl})`,

    closed: (data) =>
      `❌ PR suljettu projektissa ${data.repoFullName}\n\n` +
      `**#${data.prNumber}: ${data.prTitle}**\n\n` +
      `[Katso PR](${data.prUrl})`,
  },
};

/**
 * Nudge notification templates (progressive simplification)
 */
const nudgeTemplates: Record<
  SupportedLanguage,
  Record<number, string[]>
> = {
  en: {
    5: [
      "Tomorrow you have three meetings and two deadlines. Would you like to review priorities and preparation for each? I can help with scheduling and creating checklists.",
      "Hey! I see you have a busy week ahead. Shall we go through upcoming tasks and prioritize them together?",
    ],
    4: [
      "Hey! Tomorrow is a busy day. Shall we review what's coming up?",
      "Hi! You have a few important things coming up. Want a quick overview?",
    ],
    3: [
      "Psst... tomorrow is quite full. Let's check together? 😊",
      "Hey there! Is everything alright? Should I remind you about tomorrow? 🗓️",
    ],
    2: [
      "Okay okay, I understand you're busy... but tomorrow is REALLY full. At least a quick check? 🙏",
      "Hey hey! I'm here if you need help with tomorrow! 👋",
    ],
    1: [
      "Tomorrow busy. Check?",
      "Tomorrow full. Remember! ⏰",
    ],
    0: [
      "Tomorrow. Remember. ⚠️",
      "Are you still alive? 😱",
      "...oops, looks like you're lost. Tomorrow is a busy day! 🆘",
    ],
  },

  fi: {
    5: [
      "Huomenna on kolme meetingia ja kaksi deadlinea. Haluaisitko käydä läpi prioriteetit ja valmistautumisen jokaiselle? Voin auttaa aikataulutuksessa ja muistilistojen tekemisessä.",
      "Hei! Näen että sinulla on kiireinen viikko edessä. Käydäänkö läpi tulevat tehtävät ja priorisoidaan ne yhdessä?",
    ],
    4: [
      "Hei! Huomenna on kiireinen päivä. Käydäänkö läpi mitä on tulossa?",
      "Moi! Sinulla on muutama tärkeä juttu tulossa. Haluatko pikakatsauksen?",
    ],
    3: [
      "Psst... huomenna on kyllä aika täynnä. Tsekataan yhdessä? 😊",
      "Heippa! Onko kaikki hyvin? Muistutetaanko huomisesta? 🗓️",
    ],
    2: [
      "Okei okei, ymmärrän että olet kiireinen... mutta huomenna on TOSI täynnä. Edes pikakatsaus? 🙏",
      "Hei hei! Olen täällä jos tarvitset apua huomisen kanssa! 👋",
    ],
    1: [
      "Huomenna kiire. Katsotaan?",
      "Huomenna täynnä. Muista! ⏰",
    ],
    0: [
      "Huomenna. Muista. ⚠️",
      "Oletko vielä elossa? 😱",
      "...hups, näyttää siltä että olet hukassa. Huomenna on kiireinen päivä! 🆘",
    ],
  },
};

/**
 * Generate GitHub PR notification in user's preferred language
 */
export function generateGitHubPRNotification(
  action: string,
  data: GitHubPRNotification,
  language: SupportedLanguage = "en"
): string | null {
  const templates = githubPRTemplates[language];

  if (!templates || !templates[action]) {
    return null;
  }

  return templates[action](data);
}

/**
 * Generate nudge notification in user's preferred language
 */
export function generateNudgeNotification(
  level: number,
  language: SupportedLanguage = "en",
  upcomingEventSummary?: string
): string {
  const templates = nudgeTemplates[language];
  const levelTemplates = templates[level] || templates[0];

  // Random selection for variety
  const message = levelTemplates[Math.floor(Math.random() * levelTemplates.length)];

  // For level 5 (detailed), optionally inject event summary
  if (level === 5 && upcomingEventSummary) {
    return upcomingEventSummary;
  }

  return message;
}

/**
 * Get user's preferred language from context
 */
export async function getUserLanguage(userId: string): Promise<SupportedLanguage> {
  try {
    const { getUserContextDocument } = await import("@/lib/user-context");
    type StructuredUserContext = import("@/lib/agent/context-schema").StructuredUserContext;

    const contextDoc = await getUserContextDocument(userId);
    const context = contextDoc.data as StructuredUserContext;

    const langPref = context?.preferences?.languagePreference;

    if (langPref === "fi" || langPref === "en") {
      return langPref;
    }

    return "en"; // Default to English
  } catch (error) {
    console.error("Failed to get user language:", error);
    return "en";
  }
}
