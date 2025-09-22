export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export type ChatMessageKind = "text" | "audio" | "tool" | "state";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  kind: ChatMessageKind;
  createdAt?: string;
  error?: string;
}

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "executing"
  | "ended"
  | "error";

export interface VoiceSessionSignals {
  state: VoiceState;
  lastUpdate: number;
  transcript?: string;
  agentSpeech?: string;
  assistantResponse?: string;
  actionSummary?: string;
  error?: string;
}
