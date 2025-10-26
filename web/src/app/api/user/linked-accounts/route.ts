import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { env } from "@/env";
import { getMongoClient } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
  try {
    // Get token from Authorization header
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify JWT token
    const { payload } = await jwtVerify(token, env.JWT_SECRET);
    const userId = payload.sub;

    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const client = await getMongoClient();
    const db = client.db();

    // Get user's linked accounts
    // Note: NextAuth MongoDB adapter creates accounts with string userId,
    // but we normalize to ObjectId after linking. Query for ObjectId only.
    const accounts = await db
      .collection("accounts")
      .find({ userId: new ObjectId(userId) })
      .toArray();

    // Get user info for email and Telegram details
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

    const linkedAccounts = accounts.map((account) => ({
      provider: account.provider,
      email: account.provider === "google" ? user?.email : undefined,
      connected: true,
      scopes: account.scope,
    }));

    // Add Google if not found
    if (!linkedAccounts.find((a) => a.provider === "google")) {
      linkedAccounts.push({
        provider: "google",
        email: undefined,
        connected: false,
        scopes: undefined,
      });
    }

    return NextResponse.json({
      accounts: linkedAccounts,
      user: {
        id: userId,
        name: user?.name,
        email: user?.email,
        telegramId: user?.telegramId,
      },
    });
  } catch (error) {
    console.error("Error fetching linked accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch linked accounts" },
      { status: 500 }
    );
  }
}
