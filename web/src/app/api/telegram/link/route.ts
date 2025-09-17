import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { linkTelegramUserToAccount, upsertTelegramUser } from "@/lib/telegram/bot";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { telegramId, userId, firstName, lastName, username } = body;

    if (!telegramId) {
      return NextResponse.json({ error: "Telegram ID is required" }, { status: 400 });
    }

    await upsertTelegramUser({
      telegramId,
      userId,
      firstName,
      lastName,
      username,
      chatId: telegramId,
      isActive: true,
    });

    await linkTelegramUserToAccount(telegramId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error linking Telegram account:", error);
    return NextResponse.json({ error: "Failed to link account" }, { status: 500 });
  }
}