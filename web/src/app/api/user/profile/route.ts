import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getMongoClient } from "@/lib/db";
import { type UserProfile, type UserTier } from "@/types/user";
import { ObjectId } from "mongodb";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "telegram-mini-app-secret"
);

export async function GET(req: NextRequest) {
  try {
    // Get token from header or cookie
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

    // Get user from database
    const client = await getMongoClient();
    const usersCollection = client.db().collection("users");

    const user = await usersCollection
      .findOne({ _id: new ObjectId(userId) })
      .catch(() => null);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get or create usage data
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tier = (user.tier || "free") as UserTier;

    const profile: UserProfile = {
      id: user._id.toString(),
      telegramId: user.telegramId,
      name: user.name,
      tier,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    };

    return NextResponse.json(profile);
  } catch (error) {
    console.error("[User Profile API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Get token - only admins can update user tiers
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

    if (payload.tier !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, tier } = body;

    if (!userId || !tier) {
      return NextResponse.json(
        { error: "userId and tier are required" },
        { status: 400 }
      );
    }

    if (!["free", "paid", "admin"].includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    // Update user tier
    const client = await getMongoClient();
    const usersCollection = client.db().collection("users");

    const result = await usersCollection.updateOne(
      { telegramId: userId },
      { $set: { tier, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, tier });
  } catch (error) {
    console.error("[User Profile PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update user tier" },
      { status: 500 }
    );
  }
}
