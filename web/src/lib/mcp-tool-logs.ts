import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/db";

const COLLECTION = "mcp_tool_logs";

export interface McpToolLog {
  _id?: ObjectId;
  userId: string;
  sessionId?: string; // Group tools by workflow session
  toolName: string;

  // User-facing info (can contain emojis)
  displayTitle: string; // e.g., "📅 Checking calendar"
  displayDescription?: string; // e.g., "Looking for conflicts today"

  // Technical details
  arguments?: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "success" | "error";
  error?: string;
  duration?: number; // milliseconds

  createdAt: Date;
  updatedAt: Date;
}

async function getMcpToolLogsCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<McpToolLog>(COLLECTION);

  // Indexes for efficient queries
  await col.createIndex({ userId: 1, createdAt: -1 });
  await col.createIndex({ userId: 1, sessionId: 1, createdAt: -1 });
  await col.createIndex({ createdAt: -1 });

  return col;
}

/**
 * Log MCP tool call
 */
export async function logMcpToolCall(
  log: Omit<McpToolLog, "_id" | "createdAt" | "updatedAt">
): Promise<ObjectId> {
  const collection = await getMcpToolLogsCollection();
  const now = new Date();

  const result = await collection.insertOne({
    ...log,
    createdAt: now,
    updatedAt: now,
  });

  return result.insertedId;
}

/**
 * Update MCP tool log (for updating status/result)
 */
export async function updateMcpToolLog(
  logId: ObjectId,
  update: Partial<Pick<McpToolLog, "result" | "status" | "error" | "duration">>
): Promise<void> {
  const collection = await getMcpToolLogsCollection();

  await collection.updateOne(
    { _id: logId },
    {
      $set: {
        ...update,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Get recent tool logs for a user
 */
export async function getRecentToolLogs(
  userId: string,
  limit = 20
): Promise<McpToolLog[]> {
  const collection = await getMcpToolLogsCollection();

  return collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Get tool logs for a specific session
 */
export async function getSessionToolLogs(
  userId: string,
  sessionId: string
): Promise<McpToolLog[]> {
  const collection = await getMcpToolLogsCollection();

  return collection
    .find({ userId, sessionId })
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * Get the latest session ID for a user
 */
export async function getLatestSessionId(userId: string): Promise<string | null> {
  const collection = await getMcpToolLogsCollection();

  const latestLog = await collection
    .find({
      userId,
      sessionId: { $exists: true, $type: "string" }
    })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  return latestLog[0]?.sessionId ?? null;
}

/**
 * Generate display info for common MCP tools
 */
export function generateToolDisplayInfo(toolName: string): {
  displayTitle: string;
  displayDescription?: string;
} {
  const toolMap: Record<string, { displayTitle: string; displayDescription?: string }> = {
    "get_user_context": {
      displayTitle: "📖 Reading context",
      displayDescription: "Loading your saved information",
    },
    "update_user_context": {
      displayTitle: "✏️ Updating context",
      displayDescription: "Saving new information",
    },
    "list-calendars": {
      displayTitle: "📅 Listing calendars",
      displayDescription: "Finding your available calendars",
    },
    "list-events": {
      displayTitle: "📅 Checking calendar",
      displayDescription: "Looking for upcoming events",
    },
    "search-events": {
      displayTitle: "🔍 Searching events",
      displayDescription: "Finding specific calendar items",
    },
    "get-event": {
      displayTitle: "📝 Getting event details",
      displayDescription: "Loading event information",
    },
    "create-event": {
      displayTitle: "✨ Creating event",
      displayDescription: "Adding new calendar entry",
    },
    "update-event": {
      displayTitle: "🔄 Updating event",
      displayDescription: "Modifying calendar entry",
    },
    "delete-event": {
      displayTitle: "🗑️ Deleting event",
      displayDescription: "Removing calendar entry",
    },
    "get-freebusy": {
      displayTitle: "⏰ Checking availability",
      displayDescription: "Finding free time slots",
    },
    "get-current-time": {
      displayTitle: "🕐 Getting current time",
      displayDescription: "Checking the time",
    },
  };

  return toolMap[toolName] || {
    displayTitle: `🔧 ${toolName}`,
    displayDescription: "Using tool",
  };
}
