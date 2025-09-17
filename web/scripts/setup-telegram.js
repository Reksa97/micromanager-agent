#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.argv[2];

if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ Please set TELEGRAM_BOT_TOKEN in your .env file');
  console.error('   Get a token from @BotFather on Telegram');
  process.exit(1);
}

if (!WEBHOOK_URL) {
  console.error('❌ Please provide your webhook URL');
  console.error('   Usage: npm run setup-telegram https://your-domain.com');
  process.exit(1);
}

async function setupTelegram() {
  const webhookEndpoint = `${WEBHOOK_URL}/api/telegram/webhook`;

  console.log('🤖 Setting up Telegram bot...');
  console.log(`📍 Webhook URL: ${webhookEndpoint}`);

  // Set webhook
  const setWebhookUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;
  const webhookResponse = await fetch(setWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookEndpoint,
      allowed_updates: ['message', 'callback_query'],
    }),
  });

  const webhookResult = await webhookResponse.json();

  if (!webhookResult.ok) {
    console.error('❌ Failed to set webhook:', webhookResult.description);
    process.exit(1);
  }

  console.log('✅ Webhook set successfully!');

  // Get webhook info
  const getWebhookUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
  const infoResponse = await fetch(getWebhookUrl);
  const infoResult = await infoResponse.json();

  if (infoResult.ok) {
    console.log('\n📊 Webhook Info:');
    console.log(`   URL: ${infoResult.result.url}`);
    console.log(`   Pending updates: ${infoResult.result.pending_update_count || 0}`);
    if (infoResult.result.last_error_message) {
      console.log(`   ⚠️  Last error: ${infoResult.result.last_error_message}`);
    }
  }

  // Set bot commands
  const setCommandsUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`;
  const commandsResponse = await fetch(setCommandsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: 'Start the bot' },
        { command: 'link', description: 'Link your web account' },
        { command: 'help', description: 'Show help message' },
      ],
    }),
  });

  const commandsResult = await commandsResponse.json();

  if (commandsResult.ok) {
    console.log('✅ Bot commands set successfully!');
  } else {
    console.warn('⚠️  Failed to set bot commands:', commandsResult.description);
  }

  // Set menu button for Mini App
  const setMenuUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton`;
  const menuResponse = await fetch(setMenuUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: 'Open Mini App',
        web_app: {
          url: `${WEBHOOK_URL}/telegram`,
        },
      },
    }),
  });

  const menuResult = await menuResponse.json();

  if (menuResult.ok) {
    console.log('✅ Mini App menu button set!');
    console.log(`   URL: ${WEBHOOK_URL}/telegram`);
  } else {
    console.warn('⚠️  Failed to set menu button:', menuResult.description);
  }

  console.log('\n🎉 Telegram bot setup complete!');
  console.log('\n📱 Next steps:');
  console.log('   1. Message your bot on Telegram to test it');
  console.log('   2. Click the menu button to open the Mini App');
  console.log('   3. Use /link command to connect your account');
}

setupTelegram().catch(console.error);