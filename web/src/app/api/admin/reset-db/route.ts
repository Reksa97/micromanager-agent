import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getMongoClient } from "@/lib/db";
import { auth } from "@/auth";
import { ObjectId } from "mongodb";
import { env } from "@/env";

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
      const { payload } = await jwtVerify(token, env.JWT_SECRET);
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

/**
 * DELETE /api/admin/reset-db
 *
 * Clears the entire database for development/testing purposes.
 *
 * Safety measures:
 * - Only accessible to system admins
 * - Only works in development environment
 * - Requires explicit confirmation
 * - Logs all actions
 */
export async function DELETE(req: NextRequest) {
  try {
    // Check if user is system admin
    const isAdmin = await checkSystemAdmin(req);
    if (!isAdmin) {
      console.warn("[Reset DB] Unauthorized access attempt");
      return NextResponse.json(
        { error: "System admin access required" },
        { status: 403 }
      );
    }

    // Safety check: Only allow in development
    if (process.env.NODE_ENV === "production") {
      console.error("[Reset DB] Attempted to reset production database - BLOCKED");
      return NextResponse.json(
        { error: "Database reset is disabled in production" },
        { status: 403 }
      );
    }

    // Check for confirmation parameter
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== true) {
      return NextResponse.json(
        { error: "Confirmation required. Send { confirm: true } in request body." },
        { status: 400 }
      );
    }

    console.log("[Reset DB] Starting database reset...");

    const client = await getMongoClient();
    const db = client.db();

    // Get all collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    console.log("[Reset DB] Found collections:", collectionNames);

    // Collections to clear
    const collectionsToReset = [
      "users",
      "accounts",
      "sessions",
      "verificationTokens",
      "conversations",
      "userContext",
      "usageLogs",
      "workflowRuns",
      "toolCalls",
      "firstLoadProgress",
      "scheduledTasks",
      "workplans",
    ];

    const results: Record<string, { deleted: number; existed: boolean }> = {};

    // Clear each collection
    for (const collectionName of collectionsToReset) {
      const exists = collectionNames.includes(collectionName);

      if (exists) {
        const collection = db.collection(collectionName);
        const deleteResult = await collection.deleteMany({});
        results[collectionName] = {
          deleted: deleteResult.deletedCount,
          existed: true,
        };
        console.log(`[Reset DB] Cleared ${collectionName}: ${deleteResult.deletedCount} documents`);
      } else {
        results[collectionName] = {
          deleted: 0,
          existed: false,
        };
        console.log(`[Reset DB] Collection ${collectionName} does not exist, skipping`);
      }
    }

    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0);

    console.log(`[Reset DB] ✅ Database reset complete. Total documents deleted: ${totalDeleted}`);

    return NextResponse.json({
      success: true,
      message: `Database reset complete. Deleted ${totalDeleted} documents from ${Object.keys(results).length} collections.`,
      details: results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[Reset DB] ❌ Error during database reset:", error);
    return NextResponse.json(
      {
        error: "Failed to reset database",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
