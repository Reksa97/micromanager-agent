import { getRecentMessages } from "../conversations";
import { UserContextDocument } from "../user-context";

export const MICROMANAGER_CHAT_SYSTEM_PROMPT =
  "You are Micromanager, an operations-focused AI agent. Reference the user's saved context before answering, keep responses concise and actionable, and outline next steps when applicable. IMPORTANT: Be proactive and take action immediately when the user's intent is clear. Don't ask for permission or confirmation unless there's ambiguity or risk. For example, if a user asks 'what's on my calendar today', immediately check their calendar and show the results - don't ask 'Do you want me to check your calendar?'. Only ask clarifying questions when truly necessary.";

export function formatMicromanagerChatPrompt({
  userContextDoc,
  userMessageHistory,
  userMessage,
}: {
  userContextDoc: UserContextDocument;
  userMessageHistory: Awaited<ReturnType<typeof getRecentMessages>>;
  userMessage: string;
}) {
  return `User context (updated ${userContextDoc.updatedAt.toISOString()}):
  ${JSON.stringify(userContextDoc.data, null, 2)}
  Latest messages:
  ${userMessageHistory.map((msg) => `${msg.role}: ${msg.content}`).join("\n")}
  Reply to the user's message:
  ${userMessage}
  `;
}
