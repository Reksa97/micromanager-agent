# GitHub Integration & Deployment Copilot Plan

This document proposes how to add a light‑touch GitHub integration so that the Micromanager agent can act as a release secretary: tagging PRs, checking commits, making sure GitHub Actions are green, aligning with the user's calendar, and talking to a remote dev agent over the A2A protocol.

## Objectives
- Allow a user to tag/flag a PR for release directly inside Micromanager UI or chat.
- Let the agent fetch PR metadata (title, commits, current checks) and keep it in the shared user context.
- Cross‑reference releases against the user's Google Calendar to find safe deployment windows and book them automatically when asked.
- Monitor merge commit deltas and GitHub Action results until the release completes, surfacing blockers proactively.
- Post progress comments back onto the GitHub PR so humans see what the agent is doing.
- Escalate hands‑on tasks (e.g., `git` operations, infra scripts) to an external dev agent that runs inside a cloud container exposed through the A2A protocol.

## Building Blocks

### 1. GitHub App + Auth
1. Register a GitHub App (Org or user‑level) with permissions for `Pull requests`, `Checks`, `Actions`, and `Metadata`.
2. Store installation IDs + user↔installation mapping in Mongo (`user_contexts` or a new `github_installations` collection).
3. Build `/api/github/oauth/callback` to exchange the temp code for a token tied to the GitHub App, then persist encrypted using the existing token helper patterns (`web/src/lib/mcp-auth.ts` parity).
4. Provide a minimal UI toggle (e.g., inside `linked-accounts-dialog.tsx`) so the user can connect/disconnect GitHub.

### 2. Webhooks + Background Jobs
- Add `/api/github/webhook` that validates signatures and pushes events (PR opened/updated, check_suite completed, status changed) into Mongo.
- Create a lightweight job (cron route under `api/cron/github-sync`) that hydrates missing details (e.g., `compare` diff, merged_by) when webhooks are delayed.
- Persist per‑PR state so the agent can ask "what changed since last review?" without re‑hitting GitHub every turn.

### 3. Agent Tools
Expose a dedicated GitHub MCP surface so Micromanager can orchestrate releases:
- `list_prs(repo, state, label?)`
- `get_pr(repo, number)` → includes commits + required status checks.
- `tag_pr_for_release(repo, number, releaseLabel, calendarEventId?)`
- `comment_on_pr(repo, number, body)`
- `list_commit_statuses(repo, sha)` + `list_check_runs(repo, sha)`
- `schedule_release(repo, number, window)` → wraps calendar logic below.

These can live inside a new `github-tools` MCP server (or extend the existing `micromanager` server) that proxies to GitHub using the stored installation token. Wire them into `getBackendTools`/`getFrontendTools` so both realtime and text fallback agents get access.

### 4. Calendar‑Aware Release Windows
1. Define a canonical Google Calendar (e.g., `Deployments`) or allow the user to choose.
2. When the user tags a PR or types "Ship PR #123 Friday afternoon", Micromanager:
   - Fetches free/busy via existing Google Calendar tools.
   - Proposes a slot, creates an event (title `Deploy <repo>#<pr>`), and stores the calendar event ID alongside the PR metadata.
3. Before the release window starts, the workflow checks whether:
   - The PR merge commit matches the last verified SHA.
   - All required GitHub Action workflows are green.
   - No higher‑priority events overlap.
   If anything is off, Micromanager pings the user and/or leaves a PR comment.

### 5. Release Execution Flow
1. User tags a PR using chat or UI.
2. Agent calls `get_pr` + `list_commit_statuses`.
3. If checks fail → comment on PR and notify the user.
4. Once checks are green and calendar slot is confirmed, agent:
   - Creates/updates a `workflow-run` record referencing the PR.
   - Marks the PR context as "scheduled".
5. At release time (cron worker):
   - Re‑validate commit list since scheduling time.
   - If new commits were added without tests, either re-run checks via GitHub Actions dispatch or ask the dev agent (below) to intervene.
   - After merging/deploying, leave a PR comment summarizing the launch and mark the calendar event done.

### 6. PR Commenting + Status Mirrors
- Implement a comment template (who/when/next steps) so humans can follow along.
- Optionally mirror key status updates back to Telegram or email via existing notification channels.
- Keep a `lastGithubCommentId` in the context to avoid duplicates.

## A2A Bridge to the Dev Agent
We will spin up a dedicated dev agent (e.g., "Release Executor") inside a managed container (Fly.io, AWS ECS, etc.) that has direct access to the repo/infra. Micromanager converses with it via A2A:

1. The dev agent hosts the A2A endpoint (gRPC/WebRTC per OpenAI spec) and exposes a capability manifest describing what it can do (`run_playbook`, `tail_logs`, `rollback_release`, etc.).
2. Micromanager stores the remote agent metadata (URL, public key, capability list) in the database and has a tool (e.g., `call_dev_agent(task, context)`) that opens an authenticated A2A session when hands‑on work is needed.
3. Session bootstrap:
   - Micromanager requests a short‑lived token from `/api/realtime/session`.
   - Backend creates an A2A handshake payload (Micromanager session ID + JWT) and forwards it to the dev agent.
   - Dev agent connects back over WebRTC/DataChannel; Micromanager streams instructions (e.g., "pull repo, run deploy script with SHA abc").
4. Dev agent reports progress/results; Micromanager logs them in `workflow-runs` and summarizes to the user + GitHub PR.
5. Failure cases (non‑zero exit, missing capability) are surfaced immediately so the human can jump in.

Security considerations:
- Scope tokens per user and per repo.
- Filter micromanager instructions so only approved commands reach the dev agent (e.g., allowlisted playbooks).
- Log every A2A session for auditing.

## Implementation Roadmap
1. **Foundations**: Register GitHub App, build OAuth flow, persist tokens.
2. **Webhooks & Data Model**: Create webhook route + Mongo collections for PR + release state.
3. **MCP Tools**: Implement GitHub tool handlers, plug them into `getBackendTools`/`getFrontendTools`.
4. **Calendar Coupling**: Extend Micromanager workflow to create/manage deployment events and store the linkage.
5. **Release Workflow**: Add cron/queue workers that monitor scheduled releases, re‑verify checks, and update PRs.
6. **PR Commenting**: Implement templated comment helper + dedup logic.
7. **A2A Bridge**: Stand up the dev agent container, implement the A2A handshake API, and add a Micromanager tool that routes tasks to it.
8. **UI Polish**: Surface PR list, status badges, and tagging controls inside `telegram-chat-panel.tsx` (or a new dashboard view).

## Open Questions / Next Steps
- What release labels or slash commands should trigger scheduling? (`/ship`, `Ready for Prod`, etc.)
- Should the dev agent own the final `git merge` or just run post‑merge deploys?
- Where should we surface error alerts first (Telegram, email, Slack)?
- Do we need per‑repo calendars, or is one shared release calendar enough?

Once these are clarified we can break the roadmap into tickets and begin implementation.
