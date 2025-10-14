# Micromanager Agent - Dev Guide

## CRITICAL: Test Before Deploy
```bash
cd web && npm run build  # MUST pass
cd web && npm run test   # Run Playwright E2E tests
```

## Stack
- **Framework**: Next.js 15.5.3 (App Router)
- **Database**: MongoDB Atlas (`MONGODB_URI`)
- **Auth**: JWT (Telegram), NextAuth (web)
- **AI**: Micromanager workflow (`src/lib/agent/workflows/micromanager.workflow.ts`)
- **Telegram**: Grammy bot + Mini Apps SDK

## Commands
```bash
npm run dev     # Port 3000
npm run build   # Test before push!
npm run test    # Playwright E2E
npm run lint    # Fix errors
```

## Required Env Vars
```
MONGODB_URI=mongodb+srv://...
AUTH_SECRET=...                    # JWT secret
OPENAI_API_KEY=sk-proj-...         # For workflow
TELEGRAM_BOT_TOKEN=...             # From @BotFather
TELEGRAM_DEV_MOCK_SECRET=dev-secret  # For E2E tests
NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL=https://your-mcp.vercel.app
```

## User Management
Set admin in MongoDB:
```js
{ isSystemAdmin: true, tier: "paid", role: "admin" }
```

Access: `/admin` (system admin), `/telegram` (Telegram Mini App)

## Key Features

### 1. Micromanager Workflow
- **File**: `src/lib/agent/workflows/micromanager.workflow.ts`
- **First-load**: Sends greeting via `/api/workflow/first-load-greeting`
- **Messages**: All user messages → workflow → MCP tools (calendar, context)
- **Input**: `{ input_as_text: string, user_id: string }`
- **Output**: `{ output_text: string }`

### 2. First-Load Experience
- MongoDB-backed progress tracking
- 4 steps: "Getting to know you..." → "Preparing..." → "Setting up..." → "Almost ready..."
- Shows once per user (`hasCompletedFirstLoad` flag)
- Frontend polls `/api/first-load/status` every 500ms
- Backend runs `/api/first-load/init` (MUST await!)

### 3. Google Calendar Integration
- Link account via `/api/auth/google/link`
- MCP tools: list/search/create/update/delete events
- Tokens auto-refresh in `src/lib/google-tokens.ts`

## Common Gotchas

### Serverless MUST Await
❌ `runTask(userId).catch(...)` → **Task killed!**
✅ `await runTask(userId)` → **Task completes**

Serverless functions terminate after response. Always await async work.

### First-Load Stuck
- **Fix**: Ensure `await runFirstLoadTasks(userId)` in `/api/first-load/init`
- **Test**: Use `/api/dev/reset-progress` (paid users in prod)

### MongoDB Query Bug
- JWT `sub` = MongoDB `_id` (ObjectId string)
- Use `new ObjectId(userId)`, NOT `parseInt(userId)`

## Dev Workflow
1. Make changes
2. `npm run build` (MUST pass)
3. `npm run test` (Playwright E2E)
4. Commit & push to `dev`
5. **Wait** for deployment
6. **Test in production**
7. Confirm working before announcing

**Never announce "production ready" without testing in production!**

## Telegram Setup
1. Create bot: @BotFather
2. Webhook: `https://your-app.vercel.app/api/telegram/webhook`
3. Mini App URL: `https://your-app.vercel.app/telegram`

## Testing
- E2E tests: `__tests__/e2e/*.spec.ts`
- Mock auth: `?mock_secret=dev-secret&mock_user_id=888000001`
- Tests reset user data before each run
- Unique test IDs: 888000001, 888000002, 888000003
