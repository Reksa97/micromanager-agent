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
Create your own cluster for development

### OpenAI

OpenAI API key is required for gpt-realtime and gpt5 models

### Telegram

Create your own Telegram app with @BotFather to get your TELEGRAM_BOT_TOKEN

### Google Calendar

TODO

## Deployment

Use Vercel free hobby tier, connect to your Github and start a deployment for your repo
