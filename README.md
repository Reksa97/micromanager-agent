# micromanager-agent

## Prerequisites

- Fork this repo (if you want your own Vercel deployment)
- Install Node.js v22
- `cd web && npm install`
- `cp .env.sample .env` (and set all env variables to `.env`)
- `npm run dev`

## Integrations

### Database (MongoDB)

MongoDB cluster (free tier) running at https://cloud.mongodb.com/
Create your own cluster for development.

### OpenAI

OpenAI API key is required for gpt-realtime and gpt5 models.

### Telegram

Create your own Telegram app with @BotFather to get your `TELEGRAM_BOT_TOKEN`

Download the Telegram Desktop Beta at https://desktop.telegram.org/changelog#beta-version

In Telegram Desktop Beta -> Preferences -> Advanced -> Experimental Settings -> Enable webview inspecting

In Telegram BotFather app -> Select your bot -> Settings -> Mini Apps -> Menu Button -> set to:

- Local dev: https://127.0.0.1:3000/telegram
- Vercel deployment: https://micromanager-yourversion.vercel.app/telegram

Open your Telegram bot chat and open the Mini App -> Right Click -> Inspect Element

### Google Calendar

TODO

## Deployment

Use Vercel free hobby tier, connect to your Github and start a deployment for your repo

## Tools for developers

Install Vercel MCP for Claude (TODO commands for Codex, Cursor)

```
claude mcp add --transport http vercel https://mcp.vercel.com
```
