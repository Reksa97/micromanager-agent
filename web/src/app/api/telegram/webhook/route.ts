import { NextRequest } from "next/server";
import { getBot, upsertTelegramUser, getTelegramUserByTelegramId } from "@/lib/telegram/bot";
import { insertMessage } from "@/lib/conversations";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const bot = getBot();

    bot.command("start", async (ctx) => {
      const telegramId = ctx.from?.id;
      const firstName = ctx.from?.first_name || "";
      const lastName = ctx.from?.last_name || "";
      const username = ctx.from?.username || "";
      const chatId = ctx.chat.id;

      if (!telegramId) {
        await ctx.reply("Error: Could not identify user");
        return;
      }

      await upsertTelegramUser({
        telegramId,
        firstName,
        lastName,
        username,
        chatId,
        isActive: true,
      });

      await ctx.reply(
        `Welcome ${firstName}! 👋\n\n` +
        `I'm your Micromanager Agent assistant. You can:\n` +
        `• Send me messages and I'll help you\n` +
        `• Use /link <code> to link your web account\n` +
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

      await ctx.reply("Feature coming soon: Account linking with code: " + code);
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
          firstName: ctx.from?.first_name || "",
          lastName: ctx.from?.last_name || "",
          username: ctx.from?.username || "",
          chatId,
          isActive: true,
        });
      }

      const userId = telegramUser?.userId || `telegram_${telegramId}`;

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
        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant for the Micromanager Agent platform. Keep responses concise and helpful.",
            },
            { role: "user", content: text },
          ],
          model: "gpt-4o-mini",
          temperature: 0.7,
          max_tokens: 500,
        });

        const aiResponse = completion.choices[0].message.content || "I couldn't generate a response.";

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
        await ctx.reply("Sorry, I encountered an error processing your message. Please try again.");
      }
    });

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
