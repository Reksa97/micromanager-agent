# Micromanager Agent - Claude Development Guide

## Project Overview

A multi-platform AI agent system with web, voice, and Telegram interfaces. Users can interact with AI agents through various channels with unified message storage and cross-platform notifications.

## Tech Stack

- **Framework**: Next.js 15.5.3 with App Router
- **Database**: MongoDB (via DATABASE_URL)
- **Authentication**: NextAuth.js for web, JWT for Telegram
- **AI**: OpenAI GPT models (GPT-5, GPT-5 mini and nano)
- **Realtime**: OpenAI Realtime API for voice
- **Telegram**: Grammy bot framework, Telegram Mini Apps SDK
- **UI**: Tailwind CSS, shadcn/ui components

## Key Features

1. **Multi-channel Communication**: Web chat, voice calls, Telegram bot/mini app
2. **Unified Message Storage**: All messages stored in MongoDB with source tags
3. **Cross-platform Notifications**: Web/voice messages sent to Telegram users
4. **User Tier System**: Free/Paid/Admin with different permissions
5. **Usage Tracking**: Token usage, message limits, voice minutes
6. **System Admin Panel**: Manage users, tiers, and permissions

## Message Source Tags

- `web-user`: Messages from web interface
- `telegram-user`: Messages from Telegram
- `micromanager`: AI assistant responses
- `realtime-agent`: Voice agent responses

## User Management

### User Tiers

- **FREE**: Limited tokens, no voice, GPT-4o-mini only
- **PAID**: More tokens, voice access, multiple models
- **ADMIN**: Unlimited access, all models

### System Admin Access

Users with `tier: admin` can access `/admin` to:

- View all users
- Change user tiers
- Monitor usage
- Manage permissions

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/telegram` - Telegram authentication
- `GET /api/auth/telegram` - Verify Telegram token

### Chat

- `POST /api/chat` - Send message (web)
- `POST /api/telegram/chat` - Send message (Telegram)
- `GET /api/telegram/chat/history` - Get chat history

### User Management

- `GET /api/user/profile` - Get user profile and usage
- `PATCH /api/user/profile` - Update user tier (admin only)
- `POST /api/user/usage` - Track usage
- `GET /api/admin/users` - List all users (system admin)
- `PATCH /api/admin/users` - Update user (system admin)

### Realtime/Voice

- `POST /api/realtime/session` - Create voice session

## Environment Variables

```
DATABASE_URL=mongodb://...
AUTH_SECRET=...
OPENAI_API_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
NEXT_PUBLIC_APP_URL=...
```

## Testing Commands

```bash
npm run dev         # Start dev server with HTTPS
npm run build       # Build for production
npm run test        # Run all tests
npm run lint        # Run ESLint
```

## Important Files

- `/src/app/admin/*` - System admin UI
- `/src/app/telegram/*` - Telegram Mini App
- `/src/lib/telegram/bot.ts` - Telegram bot logic
- `/src/types/user.ts` - User types and permissions
- `/src/lib/conversations.ts` - Message storage

## Development Notes

- Always check user permissions before allowing actions
- Track token usage for all AI interactions
- Telegram Mini App requires HTTPS in development
- System admin UI is at `/admin` (requires tier admin)
- Use source tags when storing messages
- Voice features only available for paid/admin users
