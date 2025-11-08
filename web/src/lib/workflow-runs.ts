import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/db";

const COLLECTION = "workflow_runs";

export interface ToolCall {
  toolName: string;
  displayTitle: string;
  displayDescription: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "success" | "error";
  error?: string;
  duration?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRun {
  _id?: ObjectId;
  userId: string;
  sessionId: string;
  startedAt: Date;
  completedAt?: Date;
  status: "running" | "completed" | "error";
  userMessage: string;
  assistantMessage?: string;
  toolCalls: Record<string, ToolCall>;
}

async function getWorkflowRunsCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<WorkflowRun>(COLLECTION);

  // Indexes for efficient queries
  await col.createIndex({ userId: 1, startedAt: -1 });
  await col.createIndex({ sessionId: 1 }, { unique: true });
  await col.createIndex({ userId: 1, status: 1, startedAt: -1 });

  return col;
}

/**
 * Create a new workflow run
 */
export async function createWorkflowRun(
  run: Omit<WorkflowRun, "_id" | "startedAt">
): Promise<string> {
  const collection = await getWorkflowRunsCollection();
  const now = new Date();

  const result = await collection.insertOne({
    ...run,
    startedAt: now,
  });

  return result.insertedId.toString();
}

/**
 * Update workflow run (for status/message changes)
 */
export async function updateWorkflowRun(
  sessionId: string,
  update: Partial<Pick<WorkflowRun, "status" | "assistantMessage" | "completedAt">>
): Promise<void> {
  const collection = await getWorkflowRunsCollection();

  await collection.updateOne(
    { sessionId },
    { $set: update }
  );
}

/**
 * Log a tool call (add new or update existing)
 */
export async function logToolCall(
  sessionId: string,
  toolCallId: string,
  toolCall: Partial<ToolCall>
): Promise<void> {
  const collection = await getWorkflowRunsCollection();

  // Build update object with dot notation
  const updates: Record<string, unknown> = {};
  Object.entries(toolCall).forEach(([key, value]) => {
    updates[`toolCalls.${toolCallId}.${key}`] = value;
  });

  await collection.updateOne(
    { sessionId },
    { $set: updates }
  );
}

/**
 * Get workflow run by sessionId
 */
export async function getWorkflowRun(sessionId: string): Promise<WorkflowRun | null> {
  const collection = await getWorkflowRunsCollection();
  return collection.findOne({ sessionId });
}

/**
 * Get latest workflows for a user
 * Returns current running workflow (if any) and last completed workflow
 */
export async function getLatestWorkflows(
  userId: string
): Promise<{ current?: WorkflowRun; previous?: WorkflowRun }> {
  const collection = await getWorkflowRunsCollection();

  // Get current running workflow
  const current = await collection.findOne(
    { userId, status: "running" },
    { sort: { startedAt: -1 } }
  );

  // Get last completed workflow
  const previous = await collection.findOne(
    { userId, status: { $in: ["completed", "error"] } },
    { sort: { startedAt: -1 } }
  );

  return { current: current || undefined, previous: previous || undefined };
}

/**
 * Get default tool display info (fallback when agent doesn't provide log_message)
 */
export function getDefaultToolDisplayInfo(
  toolName: string,
  args?: Record<string, unknown>
): {
  displayTitle: string;
  displayDescription: string;
} {
  // Parse mcp_call to extract inner tool
  const actualTool =
    toolName === "mcp_call" && args?.name ? String(args.name) : toolName;

  const toolMap: Record<string, { displayTitle: string; displayDescription: string }> = {
    get_user_context: {
      displayTitle: "📖 Read user context",
      displayDescription: "",
    },
    update_user_context: {
      displayTitle: "✏️ Update user context",
      displayDescription: "",
    },
    get_conversation_messages: {
      displayTitle: "💬 Get conversation history",
      displayDescription: "",
    },
    "list-calendars": {
      displayTitle: "📅 List calendars",
      displayDescription: "",
    },
    "list-events": {
      displayTitle: "📅 List calendar events",
      displayDescription: "",
    },
    "search-events": {
      displayTitle: "🔍 Search calendar events",
      displayDescription: "",
    },
    "get-event": {
      displayTitle: "📝 Get event details",
      displayDescription: "",
    },
    "create-event": {
      displayTitle: "✨ Create calendar event",
      displayDescription: "",
    },
    "update-event": {
      displayTitle: "🔄 Update calendar event",
      displayDescription: "",
    },
    "delete-event": {
      displayTitle: "🗑️ Delete calendar event",
      displayDescription: "",
    },
    "get-freebusy": {
      displayTitle: "⏰ Check availability",
      displayDescription: "",
    },
    "get-current-time": {
      displayTitle: "🕐 Get current time",
      displayDescription: "",
    },
    "get_google_task_lists": {
      displayTitle: "📊 Get Task lists",
      displayDescription: ""
    },
    "get_google_tasks": {
      displayTitle: "✅ Get Tasks",
      displayDescription: "",
    },
    "create_google_task_list": {
      displayTitle: "⚒️ Create Task list",
      displayDescription: "",
    },
    "insert_google_task": {
      displayTitle: "✅ Insert Task",
      displayDescription: "",
    },
    "update_google_task": {
      displayTitle: "💾 Update a Task",
      displayDescription: "",
    },
    schedule_single_use_workflow: {
      displayTitle: "🗓️ Schedule follow-up workflow",
      displayDescription: "",
    },
  };

  return toolMap[actualTool] || {
    displayTitle: `🔧 ${actualTool}`,
    displayDescription: "",
  };
}
