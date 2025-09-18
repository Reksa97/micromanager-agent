import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getMongoClient } from "@/lib/db";
import { auth } from "@/auth";
import { ObjectId } from "mongodb";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "telegram-mini-app-secret"
);

async function checkSystemAdmin(req: NextRequest) {
  // Check both session auth and JWT token
  const session = await auth();

  if (session?.user) {
    const client = await getMongoClient();
    const user = await client.db().collection("users").findOne({
      email: session.user.email,
    });
    return user?.tier === "admin";
  }

  // Check JWT token for Telegram users
  let token = req.cookies.get("telegram-auth-token")?.value;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const client = await getMongoClient();
      const user = await client
        .db()
        .collection("users")
        .findOne({
          _id: new ObjectId(payload.sub as string),
        });
      return user?.tier === "admin";
    } catch {
      return false;
    }
  }

  return false;
}

export async function GET(req: NextRequest) {
  try {
    // Check if user is system admin
    const isAdmin = await checkSystemAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "System admin access required" },
        { status: 403 }
      );
    }

    // Get all users
    const client = await getMongoClient();
    const usersCollection = client.db().collection("users");

    const users = await usersCollection.find({}).toArray();

    return NextResponse.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        telegramId: user.telegramId,
        tier: user.tier ?? "free",
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      })),
    });
  } catch (error) {
    console.error("[Admin Users API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Check if user is system admin
    const isAdmin = await checkSystemAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "System admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, updates } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Validate tier if provided
    if (updates.tier && !["free", "paid", "admin"].includes(updates.tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    // Update user
    const client = await getMongoClient();
    const usersCollection = client.db().collection("users");

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.tier !== undefined) updateData.tier = updates.tier;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(String(userId)) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, updates: updateData });
  } catch (error) {
    console.error("[Admin Users PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
