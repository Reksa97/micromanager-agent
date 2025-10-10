# Manager Progression System

**Vision**: Turn knowledge extraction into a game where users level up their AI assistant.

---

## Progression Tiers

### 1. Micromanager (Level 0-2)
- Text chat, basic context storage, manual interactions
- **Unlock**: Sign up via Telegram

### 2. Real-Manager (Level 3-5)
- Voice calls (5-10 min), context widgets, daily check-ins, XP/streak tracking
- **Unlock**: 10 context items OR 3-day streak OR connect first integration
- **Key Features**: Stats widget, focus widget, voice call widget

### 3. Macromanager (Level 6-9)
- Auto-sync (calendar, docs, git, slack), proactive scheduling, smart notifications
- Pattern learning, goal tracking, multi-integration orchestration
- **Unlock**: Level 6 + 3+ integrations + 100 context items + 5+ voice calls
- **Behavior**: Pulls data automatically, only surfaces decisions, optimizes in background

### 4. Superman-ager (Level 10+)
- Full autonomy, cross-platform orchestration, predictive scheduling, team knowledge graph
- **Unlock**: Level 10 + all integrations + 500+ context items + 30-day streak

---

## XP & Leveling

### Earn XP
| Action | XP | Notes |
|--------|-----|-------|
| Daily check-in | +5 | Answer agent's daily question |
| Context item added | +2 | Any new information |
| Integration connected | +20 | Google, GitHub, Linear, etc. |
| Voice call completed | +15 | 5-10 min session |
| Weekly review | +30 | Share progress & blockers |
| Streak milestone | +50 | 7, 30, 90 day streaks |
| Help team member | +25 | Share context/introduce |

### Level Curve
```
Level 1-2:  0-20 XP   (Micromanager)
Level 3-5:  21-100 XP (Real-Manager)
Level 6-9:  101-300 XP (Macromanager)
Level 10+:  301+ XP   (Superman-ager)
```

### Feature Unlocks
- **L1**: Chat, basic context
- **L2**: Weather & tools
- **L3**: Google Calendar
- **L4**: 5-min voice calls
- **L5**: Daily briefs
- **L6**: Google Drive
- **L7**: GitHub/Linear
- **L8**: 15-min voice calls
- **L9**: Slack/team context
- **L10**: Full autonomy

---

## Implementation

### DB Schema (`users` collection)
```typescript
{
  level: number,
  xp: number,
  streak: number,
  lastCheckIn: Date,
  unlockedFeatures: string[],
  contextScore: number,
}
```

### XP System (`lib/gamification.ts`)
```typescript
export async function awardXP(userId: string, amount: number, reason: string) {
  const user = await getUser(userId);
  const newXp = user.xp + amount;
  const newLevel = calculateLevel(newXp);

  if (newLevel > user.level) {
    await handleLevelUp(userId, newLevel);
  }

  await updateUser(userId, { xp: newXp, level: newLevel });
}

function calculateLevel(xp: number): number {
  if (xp < 21) return Math.floor(xp / 10) + 1;
  if (xp < 101) return Math.floor((xp - 20) / 20) + 3;
  if (xp < 301) return Math.floor((xp - 100) / 50) + 6;
  return 10;
}
```

### Daily Check-in
```typescript
if (isNewDay(user.lastCheckIn)) {
  await sendMessage(generateDailyQuestion(user));
  await awardXP(user.id, 5, "daily_checkin");
  await updateStreak(user.id);
}
```

---

## Context Extraction Questions

1. "What's consuming most of your time?" → Priorities, pain points
2. "Who do you collaborate with?" → Team structure
3. "What's your ideal schedule?" → Work preferences
4. "Which tools do you use daily?" → Integration opportunities
5. "What would you automate?" → Automation targets
6. "What meetings drain energy?" → Calendar optimization
7. "Where do you keep notes?" → Documentation sources

Each answer = immediate value + XP + context saved
