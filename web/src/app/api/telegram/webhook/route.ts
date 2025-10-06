import { NextRequest } from "next/server";
import { Bot } from "grammy";
import {
  initBot,
  upsertTelegramUser,
  getTelegramUserByTelegramId,
} from "@/lib/telegram/bot";
import { insertMessage } from "@/lib/conversations";
import { generateTelegramServerToken } from "@/lib/telegram/auth";

let bot: Bot | null = null;
let handlersRegistered = false;

async function setupBot() {
  if (!bot) {
    bot = await initBot();
  }

  if (!handlersRegistered) {
    bot.command("start", async (ctx) => {
      const telegramId = ctx.from?.id;
      const firstName = ctx.from?.first_name || "";
      const username = ctx.from?.username || "";
      const chatId = ctx.chat.id;

      if (!telegramId) {
        await ctx.reply("Error: Could not identify user");
        return;
      }

      await upsertTelegramUser({
        telegramId,
        name: firstName,
        email: username,
        telegramChatId: chatId,
        id: `telegram_${telegramId}`,
        lastLogin: new Date(),
      });

      await ctx.reply(
        `Welcome ${firstName}! 👋\n\n` +
          `I'm your Micromanager Agent assistant. You can:\n` +
          `• Send me messages and I'll help you\n` +
          `• Use /link YOUR_CODE to link your web account\n` +
          `• Open the Mini App for a richer experience\n\n` +
          `How can I assist you today?`,
        { parse_mode: "HTML" }
      );
    });

    bot.command("link", async (ctx) => {
      const code = ctx.match;
      if (!code) {
        await ctx.reply("Please provide a linking code: /link YOUR_CODE");
        return;
      }

      await ctx.reply(
        "Feature coming soon: Account linking with code: " + code
      );
    });

    bot.on("message:text", async (ctx) => {
      const telegramId = ctx.from?.id;
      const text = ctx.message?.text;
      const chatId = ctx.chat.id;

      if (!telegramId || !text) return;

      const telegramUser = await getTelegramUserByTelegramId(telegramId);

      if (!telegramUser) {
        await upsertTelegramUser({
          telegramId,
          email: ctx.from?.username || "",
          name: ctx.from?.first_name || ctx.from?.username || "",
          telegramChatId: chatId,
          id: `telegram_${telegramId}`,
          lastLogin: new Date(),
        });
      }

      const userId = telegramUser?.id ?? `telegram_${telegramId}`;

      await insertMessage({
        userId,
        role: "user",
        content: text,
        type: "text",
        source: "telegram-user",
        telegramChatId: chatId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ctx.replyWithChatAction("typing");

      try {
        const serverToken = await generateTelegramServerToken();

        const response = await fetch(`${process.env.APP_URL}/api/telegram/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serverToken}`,
          },
          body: JSON.stringify({
            userId,
            message: text,
            source: "telegram",
          }),
        });

        if (!response.ok) {
          throw new Error(`Chat API returned ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.reply || "I couldn't generate a response.";

        await insertMessage({
          userId,
          role: "assistant",
          content: aiResponse,
          type: "text",
          source: "micromanager",
          telegramChatId: chatId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await ctx.reply(aiResponse, { parse_mode: "Markdown" });
      } catch (error) {
        console.error("Error processing Telegram message:", error);
        await ctx.reply(
          "Sorry, I encountered an error processing your message. Please try again."
        );
      }
    });

    handlersRegistered = true;
  }

  return bot;
}

export async function POST(req: NextRequest) {
  try {
    const bot = await setupBot();
    const body = await req.json();
    await bot.handleUpdate(body);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function GET() {
  return new Response("Telegram webhook is running", { status: 200 });
}
