import {
  hostedMcpTool,
  Agent,
  AgentInputItem,
  Runner,
  user,
  assistant,
} from "@openai/agents";
import { getHostedMcpParams } from "./helpers";
import { logUsage, calculateCost } from "@/lib/usage-tracking";
import type { UsageLog } from "@/lib/usage-tracking";
import { createWorkflowRun, updateWorkflowRun } from "@/lib/workflow-runs";
import { ObjectId } from "mongodb";
import { MODELS } from "@/lib/utils";
import { getRecentMessages } from "@/lib/conversations";
import { McpToolName } from "@/app/mcp/route";
import { createWorkplanTool } from "../workplan-tool.server";

type WorkflowInput = {
  input_as_text: string;
  user_id: string;
  source?: UsageLog["source"];
  usageTaskType?: UsageLog["taskType"];
  model?: string;
};

// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
  const usageTaskType = workflow.usageTaskType ?? "workflow";
  const source = workflow.source ?? "api";
  const modelName = workflow.model ?? MODELS.text;
  const startTime = Date.now();
  const estimatedInputTokens = Math.ceil(workflow.input_as_text.length / 4);
  const sessionId = new ObjectId().toString(); // Unique session for this workflow run

  const safeLogUsage = async (
    log: Omit<UsageLog, "_id" | "createdAt">
  ): Promise<void> => {
    try {
      await logUsage(log);
    } catch (error) {
      console.error("Failed to log usage:", error);
    }
  };

  // Tool definitions
  const mcp = hostedMcpTool({
    serverLabel: "micromanager_mcp",
    allowedTools: [
      "get_user_context",
      "update_user_context",
      "get_conversation_messages",
      "list-calendars",
      "list-events",
      "search-events",
      "get-event",
      "list-colors",
      "create-event",
      "update-event",
      "delete-event",
      "get-freebusy",
      "get-current-time",
      "get_google_task_lists",
      "get_google_tasks",
      "create_google_task_list",
      "insert_google_task",
      "update_google_task",
    ] as McpToolName[],
    requireApproval: "never",
    ...(await getHostedMcpParams(workflow.user_id, sessionId)),
  });
  const workplanTool = createWorkplanTool(workflow.user_id);

  const micromanager = new Agent({
    name: "Micromanager",
    instructions:
      "You are a helpful micromanager who wants to learn about the user constantly. Use the available tools to understand the user context before sending them a short, personalised message. If the user asks you to do something, even if it is unclear, do something useful. Never just ask for confirmation or a clarification, always do something useful. Keep the writable user context concise and add details there when you learn something from tool usage or from the user messages.\n\nYou have access to recent conversation history through the conversation messages array. If you need more context from earlier in the conversation, you can use the get_conversation_messages tool to fetch additional messages.\n\nWhen the user asks about upcoming events, preparation, work plans or next steps, first call the `get_workplans` tool. It returns the cached workplans generated for the user's upcoming events (already stored in the database). Prefer those cached plans over generating new ones yourself. Only fall back to other tools (like calendar listings) if the workplan tool indicates no data is available. The tool accepts `eventTitle` and `eventId` filters—use them to target the specific event the user mentioned instead of regenerating from scratch.",
    model: modelName,
    tools: [workplanTool, mcp],
    modelSettings: {
      reasoning: {
        effort: "low",
        summary: "auto",
      },
      store: true,
    },
  });
  // Fetch recent messages from MongoDB (excluding the current message which will be added below)
  // Get 10 messages, but don't include the very latest user message that just came in
  const recentMessages = await getRecentMessages(workflow.user_id, 10);

  // Build conversation history from MongoDB messages
  const conversationHistory: AgentInputItem[] = recentMessages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => {
      if (msg.role === "user") {
        return user(msg.content);
      } else {
        return assistant(msg.content);
      }
    });

  // Add the current user message at the end
  conversationHistory.push(user(workflow.input_as_text));

  // Create workflow run document
  await createWorkflowRun({
    userId: workflow.user_id,
    sessionId,
    userMessage: workflow.input_as_text,
    status: "running",
    toolCalls: {},
  });

  const runner = new Runner({
    traceMetadata: {
      __trace_source__: "agent-builder",
      workflow_id: "wf_68e8187e5a54819088e2c66b9759dfad05894cb3d3f82dfb",
    },
  });
  let micromanagerResultTemp;

  try {
    micromanagerResultTemp = await runner.run(micromanager, [
      ...conversationHistory,
    ]);
  } catch (error) {
    const duration = Date.now() - startTime;
    const inputTokens = estimatedInputTokens;
    const outputTokens = 0;
    const totalTokens = inputTokens + outputTokens;
    const cost = calculateCost({
      inputTokens,
      outputTokens,
      model: modelName,
    });

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await safeLogUsage({
      userId: workflow.user_id,
      taskType: usageTaskType,
      source,
      inputTokens,
      outputTokens,
      totalTokens,
      ...cost,
      toolCalls: 0,
      toolNames: [],
      model: modelName,
      duration,
      success: false,
      error: errorMessage,
    });

    // Update workflow run status
    await updateWorkflowRun(sessionId, {
      status: "error",
      assistantMessage: "Connection lost. Try again later.",
      completedAt: new Date(),
    });

    // Return user-friendly error instead of throwing
    return {
      output_text: "Connection lost. Try again later.",
      error: true,
      errorMessage,
    };
  }

  conversationHistory.push(
    ...micromanagerResultTemp.newItems.map((item) => item.rawItem)
  );

  if (!micromanagerResultTemp.finalOutput) {
    // Update workflow run status
    await updateWorkflowRun(sessionId, {
      status: "error",
      assistantMessage: "Error processing response. Try again.",
      completedAt: new Date(),
    });

    // Return user-friendly error instead of throwing
    return {
      output_text: "Error processing response. Try again.",
      error: true,
      errorMessage: "Agent result is undefined",
    };
  }

  const micromanagerResult = {
    output_text: micromanagerResultTemp.finalOutput ?? "",
  };

  // Log usage for tracking
  // Extract usage from result - try to get from providerData or estimate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultAny = micromanagerResultTemp as any;
  const usage = resultAny.usage || {};

  // Estimate tokens if not available
  const inputTokens = usage.input_tokens || estimatedInputTokens;
  const outputTokens =
    usage.output_tokens ||
    Math.ceil((micromanagerResultTemp.finalOutput?.length || 0) / 4);
  const totalTokens = inputTokens + outputTokens;

  const cost = calculateCost({
    inputTokens,
    outputTokens,
    model: modelName,
  });

  // Count tool calls from newItems
  const toolCalls = micromanagerResultTemp.newItems.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item) => (item.rawItem as any).type === "hosted_tool_call"
  ).length;

  // Extract tool names from hosted_tool_call items
  const toolNames = micromanagerResultTemp.newItems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((item) => (item.rawItem as any).type === "hosted_tool_call")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item) => (item.rawItem as any).name || "unknown")
    .filter((name, index, arr) => arr.indexOf(name) === index); // unique

  const duration = Date.now() - startTime;

  await safeLogUsage({
    userId: workflow.user_id,
    taskType: usageTaskType,
    source,
    inputTokens,
    outputTokens,
    totalTokens,
    ...cost,
    toolCalls,
    toolNames,
    model: modelName,
    duration,
    success: true,
  });

  // Update workflow run status
  await updateWorkflowRun(sessionId, {
    status: "completed",
    assistantMessage: micromanagerResult.output_text,
    completedAt: new Date(),
  });

  return micromanagerResult;
};
