# micromanager-agent

## Prerequisites

- Fork this repo (if you want your own Vercel deployment)
- Install Node.js v22
- `cd web`
- `npm install`
- `cp .env.sample .env` (then fill out the values in `web/.env`)
- `npm run dev`

## Integrations

### Database (MongoDB)

MongoDB cluster (free tier) running at https://cloud.mongodb.com/
Create your own cluster for development.

### OpenAI

OpenAI API key is required for both the realtime agent (`gpt-realtime`) and the text model (`gpt-5-nano`).

### Telegram

Create your own Telegram app with @BotFather to get your `TELEGRAM_BOT_TOKEN`

Download the Telegram Desktop Beta at https://desktop.telegram.org/changelog#beta-version

In Telegram Desktop Beta -> Preferences -> Advanced -> Experimental Settings -> Enable webview inspecting

In Telegram BotFather app -> Select your bot -> Settings -> Mini Apps -> Menu Button -> set to:

- Local dev: https://127.0.0.1:3000/telegram
- Vercel deployment: https://micromanager-yourversion.vercel.app/telegram

Open your Telegram bot chat and open the Mini App -> Right Click -> Inspect Element

### Google Calendar

1. Create a new project in [Google Cloud Console](https://console.cloud.google.com/) and enable Google Auth Platform.
2. Create a new client for the project and save the client ID and secret. Authorized redirect URI for dev is `https://localhost:3000/api/auth/callback/google`, and authorized javascript origin is `https://localhost:3000`
3. Set environment variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with the id and secret respectively.
4. When project publishing status is "Testing", emails need to be added as test users on the "Audience" screen to allow them to authenticate. After the project is "Published", this will not be necessary.
5. Enable Google Calendar API

## Deployment

Use Vercel free hobby tier, connect to your Github and start a deployment for your repo

## Tools for developers

Install Vercel MCP for Claude (TODO commands for Codex, Cursor)

```
claude mcp add --transport http vercel https://mcp.vercel.com
```
