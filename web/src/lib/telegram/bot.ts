import { Bot, webhookCallback } from "grammy";
import { getMongoClient } from "@/lib/db";

type SendMessageOptions = Parameters<Bot["api"]["sendMessage"]>[2];

export interface TelegramUser {
  _id?: string;
  telegramId: number;
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  chatId: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TELEGRAM_USERS_COLLECTION = "telegram_users";

async function telegramUsersCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<TelegramUser>(TELEGRAM_USERS_COLLECTION);
  await col.createIndex({ telegramId: 1 }, { unique: true });
  await col.createIndex({ userId: 1 });
  await col.createIndex({ chatId: 1 });
  return col;
}

export async function getTelegramUserByUserId(userId: string): Promise<TelegramUser | null> {
  const col = await telegramUsersCollection();
  return await col.findOne({ userId });
}

export async function getTelegramUserByTelegramId(telegramId: number): Promise<TelegramUser | null> {
  const col = await telegramUsersCollection();
  return await col.findOne({ telegramId });
}

export async function upsertTelegramUser(telegramUser: Omit<TelegramUser, "_id" | "createdAt" | "updatedAt">): Promise<void> {
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

export async function linkTelegramUserToAccount(telegramId: number, userId: string): Promise<void> {
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
  options?: SendMessageOptions,
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
    const telegramUser = await getTelegramUserByUserId(userId);
    if (!telegramUser || !telegramUser.chatId) {
      console.log(`No active Telegram user found for userId: ${userId}`);
      return { success: false, error: "No Telegram user linked" };
    }

    const success = await sendTelegramMessage(telegramUser.chatId, message);
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
