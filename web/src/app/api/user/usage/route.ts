import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getMongoClient } from "@/lib/db";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "telegram-mini-app-secret"
);

export async function POST(req: NextRequest) {
  try {
    // Get token
    let token = req.cookies.get("telegram-auth-token")?.value;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.sub as string;

    const body = await req.json();
    const { tokens, messages, voiceMinutes } = body;

    // Update usage
    const client = await getMongoClient();
    const usageCollection = client.db().collection("usage");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = {
      $inc: {},
      $set: { lastUpdated: new Date() },
    };

    if (tokens) {
      update.$inc.tokensUsed = tokens;
    }

    if (messages) {
      update.$inc[`dailyMessages.${todayKey}`] = messages;
    }

    if (voiceMinutes) {
      update.$inc.voiceMinutesUsed = voiceMinutes;
    }

    await usageCollection.updateOne(
      {
        userId,
        month: today.getMonth(),
        year: today.getFullYear(),
      },
      update,
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Usage Tracking API] Error:", error);
    return NextResponse.json(
      { error: "Failed to update usage" },
      { status: 500 }
    );
  }
}
