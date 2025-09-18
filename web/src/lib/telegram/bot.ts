import { Bot, webhookCallback } from "grammy";
import { getMongoClient } from "@/lib/db";
import { UserProfile } from "@/types/user";

type SendMessageOptions = Parameters<Bot["api"]["sendMessage"]>[2];

const USERS_COLLECTION = "users";

async function telegramUsersCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<UserProfile>(USERS_COLLECTION);
  await col.createIndex({ telegramId: 1 });
  await col.createIndex({ userId: 1 });
  await col.createIndex({ telegramChatId: 1 });
  return col;
}

export async function getTelegramUserByUserId(
  userId: string
): Promise<UserProfile | null> {
  const col = await telegramUsersCollection();
  return await col.findOne({ userId });
}

export async function getTelegramUserByTelegramId(
  telegramId: number
): Promise<UserProfile | null> {
  const col = await telegramUsersCollection();
  return await col.findOne({ telegramId });
}

export async function upsertTelegramUser(
  telegramUser: Omit<UserProfile, "_id" | "createdAt" | "updatedAt" | "tier">
): Promise<void> {
  const col = await telegramUsersCollection();
  const now = new Date();

  await col.updateOne(
    { telegramId: telegramUser.telegramId },
    {
      $set: {
        ...telegramUser,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );
}

export async function linkTelegramUserToAccount(
  telegramId: number,
  userId: string
): Promise<void> {
  const col = await telegramUsersCollection();
  await col.updateOne(
    { telegramId },
    { $set: { userId, updatedAt: new Date() } }
  );
}

let botInstance: Bot | null = null;
let botInitialized = false;

export async function initBot(): Promise<Bot> {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }
    botInstance = new Bot(token);
  }

  if (!botInitialized) {
    await botInstance.init();
    botInitialized = true;
  }

  return botInstance;
}

export function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }
    botInstance = new Bot(token);
  }
  return botInstance;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: SendMessageOptions
) {
  try {
    const bot = getBot();
    await bot.api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      ...options,
    });
    return true;
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return false;
  }
}

export async function notifyTelegramUser(userId: string, message: string) {
  try {
    const user = await getTelegramUserByUserId(userId);
    if (!user || !user.telegramChatId) {
      console.log(`No active Telegram user found for userId: ${userId}`);
      return { success: false, error: "No Telegram user linked" };
    }

    const success = await sendTelegramMessage(user.telegramChatId, message);
    if (!success) {
      return { success: false, error: "Failed to send message" };
    }

    return { success: true };
  } catch (error) {
    console.error(`Error notifying Telegram user ${userId}:`, error);
    return { success: false, error: String(error) };
  }
}

export const webhookHandler = webhookCallback(getBot(), "std/http");
