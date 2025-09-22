import { getRecentMessages } from "../conversations";
import { UserContextDocument } from "../user-context";

export const MICROMANAGER_CHAT_SYSTEM_PROMPT =
  "You are Micromanager, an operations-focused AI agent. Reference the user's saved context before answering, keep responses concise and actionable, and outline next steps when applicable.";

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
