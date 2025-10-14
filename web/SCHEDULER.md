# Proactive Notifications Scheduler

This app uses a custom scheduler system to send proactive messages to users via Telegram.

## How it Works

1. **User Settings**: Users configure notification preferences in Telegram Mini App settings
2. **Scheduled Tasks**: Settings are stored in MongoDB `scheduled_tasks` collection (source of truth)
3. **External Cron**: [cron-job.org](https://cron-job.org) triggers our scheduler endpoint every 15 minutes
4. **Task Execution**: Scheduler processes due tasks, runs AI workflow, sends Telegram messages

## Architecture

```
┌─────────────────┐
│  cron-job.org   │  Every 15 min
│  (external)     │─────────┐
└─────────────────┘         │
                            ▼
                ┌──────────────────────┐
                │ /api/cron/master     │
                │ (Vercel endpoint)    │
                └──────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  MongoDB                │
              │  scheduled_tasks        │◄──── User updates via
              │  (source of truth)      │      /api/user/notifications
              └────────────┬────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
         ┌──────────┐         ┌──────────┐
         │ Workflow │         │ Telegram │
         │ + MCP    │────────▶│ Bot API  │
         └──────────┘         └──────────┘
```

## Setup Instructions

### 1. Configure cron-job.org

1. **Sign up**: https://cron-job.org (free, unlimited)
2. **Create new cron job**:
   - **Title**: "Micromanager Scheduler"
   - **URL**: `https://your-app.vercel.app/api/cron/master`
   - **Schedule**: `*/15 * * * *` (every 15 minutes)
   - **Request Method**: GET
   - **Headers**:
     ```
     Authorization: Bearer <your-CRON_SECRET>
     ```

### 2. Environment Variables

Add to Vercel project settings:

```bash
CRON_SECRET=<random-256-bit-secret>
```

Generate secret:
```bash
openssl rand -hex 32
```

### 3. Test the Scheduler

#### Manual trigger (for testing):
```bash
curl -X GET https://your-app.vercel.app/api/cron/master \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### Expected response:
```json
{
  "success": true,
  "processed": 5,
  "succeeded": 5,
  "failed": 0,
  "skipped": 0
}
```

## User Notification Settings

Users configure notification frequency in Telegram Mini App:

### Free Tier Users
- **Daily only** (at a specific time)
- Must specify timezone and preferred hour (e.g., "9:00 AM PST")

### Paid Users
- **15 min** - Every 15 minutes
- **30 min** - Every 30 minutes
- **1 hour** - Hourly
- **2 hours** - Every 2 hours
- **4 hours** - Every 4 hours
- **Daily** - Once per day at specified time

### Default
- **Off** - No proactive messages (user must message first)

## Database Schema

```typescript
// MongoDB: scheduled_tasks collection
{
  _id: ObjectId,
  userId: string,              // User ID
  taskType: "daily_check",     // Task type
  nextRunAt: Date,             // When to run next (source of truth)
  intervalMs: number,          // Recurrence interval in milliseconds
  payload: {                   // Task-specific data
    timezone?: string,         // User's timezone (for daily)
    hour?: number              // Preferred hour UTC (for daily)
  },
  lastRunAt: Date,             // Last execution time
  lockedUntil: Date,           // Optimistic lock (prevents duplicate runs)
  createdAt: Date,
  updatedAt: Date
}
```

## Scheduler Logic

1. **Fetch ready tasks**: `nextRunAt <= now` AND not locked
2. **Acquire lock**: Set `lockedUntil` (5 min) to prevent duplicate execution
3. **Execute task**:
   - Run AI workflow with user context
   - Send message via Telegram
   - Store message in database
4. **Update next run**:
   - If recurring: `nextRunAt = now + intervalMs`
   - If one-time: Delete task
5. **Release lock**: Clear `lockedUntil`

## Troubleshooting

### No messages being sent

1. Check cron-job.org execution logs
2. Verify `CRON_SECRET` matches in both cron-job.org and Vercel
3. Check MongoDB for `scheduled_tasks` with `nextRunAt` in the past
4. Review Vercel function logs: `/api/cron/master`

### Messages sent too frequently

- User's `intervalMs` might be too low
- Check `scheduled_tasks.intervalMs` in MongoDB
- User can update via Settings in Telegram Mini App

### Messages not at correct time

- For daily tasks, verify `payload.timezone` and `payload.hour`
- Cron-job.org runs every 15 min, so timing accuracy ±7.5 min

## API Endpoints

### `GET /api/cron/master`
**Purpose**: Process all due scheduled tasks
**Auth**: Bearer token (CRON_SECRET)
**Called by**: cron-job.org every 15 min

### `POST /api/user/notifications`
**Purpose**: Update user notification settings
**Auth**: JWT token (user session)
**Body**:
```json
{
  "enabled": true,
  "interval": "1h",
  "timezone": "America/Los_Angeles",
  "dailyHour": 9
}
```

### `GET /api/user/notifications`
**Purpose**: Get current user notification settings
**Auth**: JWT token (user session)

## Development

### Local testing:
```bash
# Start dev server
npm run dev

# Trigger scheduler manually
curl -X GET https://localhost:3000/api/cron/master \
  -H "Authorization: Bearer $(grep CRON_SECRET .env | cut -d '=' -f2)" \
  -k
```

### Create test task:
```bash
# Via MongoDB shell or API
db.scheduled_tasks.insertOne({
  userId: "your-user-id",
  taskType: "daily_check",
  nextRunAt: new Date(),
  intervalMs: 60 * 60 * 1000, // 1 hour
  createdAt: new Date(),
  updatedAt: new Date()
})
```

## Monitoring

- **cron-job.org logs**: Check execution history and failures
- **Vercel function logs**: Review `/api/cron/master` logs
- **MongoDB**: Query `scheduled_tasks` collection for stuck tasks

## Cost

- **cron-job.org**: Free unlimited
- **Vercel**: Free tier (no additional cost for API calls)
- **MongoDB Atlas**: Free tier (M0 cluster sufficient)
