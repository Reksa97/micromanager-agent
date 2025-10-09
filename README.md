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

#### Telegram Webhook

Run the following to setup the mini-app, and allow Telegram to send user messages to your API

```
npm run setup-telegram -- https://yoursubdomain.vercel.app
```

### Google Calendar

1. Create a new project in [Google Cloud Console](https://console.cloud.google.com/) and enable Google Auth Platform.
2. Create a new client for the project and save the client ID and secret. Authorized redirect URI for dev is `https://localhost:3000/api/auth/callback/google`, and authorized javascript origin is `https://localhost:3000`
3. Set environment variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with the id and secret respectively.
4. When project publishing status is "Testing", emails need to be added as test users on the "Audience" screen to allow them to authenticate. After the project is "Published", this will not be necessary.
5. Enable Google Calendar API

## Deployment

### Vercel

Use Vercel free hobby tier, connect to your Github and start a deployment for your repo

### Google Cloud Run (free tier)

Alternatively deploy to Google Cloud Run using the configuration under `infra/gcp`:

- Follow `infra/gcp/README.md` to create a project, enable APIs, and store secrets
- Build and deploy with `./infra/gcp/deploy-cloud-run.sh --project YOUR_PROJECT_ID`
- Point `NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL` and Telegram webhook URLs at the Cloud Run domain once it is live

## Tools for developers

### Cloudflare Tunnel

Install `cloudflared` and serve your local server from a public url (required for OpenAI hosted MCP tools)
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

```
cloudflared tunnel --url https://127.0.0.1:3000
```

Copy your Tunnel URL and set it to your `NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL` in `.env`

### MCP Inspector

Open MCP inspector for manually exploring the MCP server

```
npx @modelcontextprotocol/inspector
```

### Vercel MCP tools

Install Vercel MCP for Claude (TODO include commands for Codex, Cursor)

```
claude mcp add --transport http vercel https://mcp.vercel.com
```
