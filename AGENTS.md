# Agents

## Micromanager Operations Copilot
- **Type:** Hybrid text + voice GPT Realtime agent
- **Entry point:** `src/features/chat/components/chat-panel.tsx`
- **Realtime session bootstrap:** `/api/realtime/session`
- **Capabilities:**
  - Streams live responses (text + audio) from `gpt-realtime` via WebRTC
  - Surfaces meeting state (listening, processing, speaking) with animated UI feedback
  - Persists voice transcripts and assistant turns once the stream completes
  - Falls back to standard chat completions when no realtime session is active
- **User context storage:** MongoDB `conversation_messages` collection keyed by `userId`
- **Authentication:** Auth.js credential login backed by MongoDB adapter

## Text Chat Fallback
- **Type:** GPT text completion (`gpt-4o-mini` by default)
- **API route:** `/api/chat`
- **Streaming:** Server-sent streaming of assistant tokens to the UI with final persistence on completion
- **Usage:** Automatically powers the chat panel when realtime session is not active or prior to session bootstrap

## Voice Session Transport
- **Hook:** `useRealtimeAgent`
- **Library:** `@openai/agents-realtime`
- **Behaviours:**
  - Creates `RealtimeSession` over WebRTC only after the user clicks “Start Voice Agent”
  - Maintains voice state machine (idle, listening, processing, speaking, executing)
  - Periodically flushes transcripts + deltas to `/api/conversation` for durable storage
  - Mirrors agent events for UI animation and transcript previews
