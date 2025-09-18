# Architecture Overview

## Technology Stack

- **Framework:** Next.js 15 (App Router, Turbopack) with React 19
- **Styling:** Tailwind CSS 3.4 + shadcn-inspired component primitives, custom theme tokens in `globals.css`
- **Auth:** Auth.js (NextAuth v5 beta) credentials provider, MongoDB adapter
- **Data:** MongoDB Atlas (connection string via `MONGODB_URI`), dedicated collections for users and conversation messages
- **AI:** OpenAI GPT APIs
  - `gpt-realtime` via WebRTC (voice + actions)
  - `gpt-5-mini` (text fallback streaming)
- **UI Enhancements:** `framer-motion`, Radix UI primitives, Sonner toasts

## Runtime Flow

1. **Authentication**

   - `/api/auth/register` hashes credentials server-side (bcrypt) and seeds Mongo `users`
   - Auth.js credential provider validates passwords and issues JWT sessions; session data enriched with user id
   - `login/page.tsx` uses `signIn` for SPA login, falling back to Auth.js default on failure

2. **Data Access Layer**

   - `src/lib/db.ts` exports a shared `MongoClient` (global cached in dev) + `getMongoClient()` helper that pings before use
   - Conversation helpers in `src/lib/conversations.ts` encapsulate message persistence and retrieval per `userId`

3. **Text Chat Pipeline**

   - Client hook `useChat` fetches history from `/api/chat` (GET) and polls on a sliding interval (1s while assistant messages are streaming, 10s when idle)
   - Submissions optimistically add the user message plus an assistant placeholder, POST to `/api/chat`, and keep polling until the backend finalises the turn
   - `/api/chat` now runs server-side streaming only: it inserts the user turn, creates an assistant stub with `metadata.streaming=true`, streams OpenAI deltas, throttles Mongo updates (~1s), marks the message complete, and returns a JSON acknowledgment with the final text or error state

4. **Realtime Voice Pipeline**

   - `useRealtimeAgent` lazily requests an ephemeral client secret via `/api/realtime/session`
   - Establishes `RealtimeSession` (WebRTC); listens to transcript & audio deltas, surfaces state to UI, flushes transcripts/messages to `/api/conversation`
   - Voice transcripts persist separately from the main chat feed; `/api/conversation` handles batched storage, and future tools can bridge into text chat explicitly when needed

5. **Frontend Composition**
   - `app/page.tsx` (protected route) renders hero header + `ChatPanel`
   - `ChatPanel` orchestrates text chat UI, session controls, voice visualiser, and context panel
   - Global layout sets ThemeProvider, fonts, Sonner toaster

## Environment & Secrets

Required entries in `web/.env`:

- `MONGODB_URI` – MongoDB connection string
- `OPENAI_API_KEY` – API key with Realtime + GPT access
- `AUTH_SECRET` – Auth.js secret (prefers explicit value; dev fallback warns)
- Optional: `OPENAI_PROJECT`, `OPENAI_REALTIME_MODEL`, `OPENAI_TEXT_MODEL`

## Deployment Notes

- Ensure npm install after lockfile patches (Next.js auto-adds SWC binaries)
- Realtime features require HTTPS + WebRTC-friendly hosting (localhost via Chrome for dev)
- Voice agent depends on browser microphone permissions and stable outbound network to OpenAI endpoints
