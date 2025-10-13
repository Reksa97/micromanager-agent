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
import { logMcpToolCall, generateToolDisplayInfo } from "@/lib/mcp-tool-logs";
import { ObjectId } from "mongodb";
import { MODELS } from "@/lib/utils";
import { getRecentMessages } from "@/lib/conversations";

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
    ],
    requireApproval: "never",
    ...(await getHostedMcpParams(workflow.user_id)),
  });
  const micromanager = new Agent({
    name: "Micromanager",
    instructions:
      "You are a helpful micromanager who wants to learn about the user constantly. Use the available tools to understand the user context before sending them a short, personalised message. If the user asks you to do something, even if it is unclear, do something useful. Never just ask for confirmation or a clarification, always do something useful. Keep the writable user context concise and add details there when you learn something from tool usage or from the user messages.\n\nYou have access to recent conversation history through the conversation messages array. If you need more context from earlier in the conversation, you can use the get_conversation_messages tool to fetch additional messages.",
    model: modelName,
    tools: [mcp],
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
    // Return user-friendly error instead of throwing
    return {
      output_text: "Virhe vastauksen käsittelyssä. Yritä uudelleen.",
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

  // Log MCP tool calls
  const safeLogToolCall = async (
    log: Omit<Parameters<typeof logMcpToolCall>[0], "createdAt" | "updatedAt">
  ): Promise<void> => {
    try {
      await logMcpToolCall(log);
    } catch (error) {
      console.error("Failed to log MCP tool call:", error);
    }
  };

  // Log each tool call from the workflow execution
  for (const item of micromanagerResultTemp.newItems) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawItem = item.rawItem as any;
    if (rawItem.type === "hosted_tool_call") {
      const toolName = rawItem.name || "unknown";
      const toolArgs = rawItem.arguments || {};
      const toolResult = rawItem.result;
      const hasError = rawItem.error !== undefined;

      const displayInfo = generateToolDisplayInfo(toolName);

      await safeLogToolCall({
        userId: workflow.user_id,
        sessionId,
        toolName,
        displayTitle: displayInfo.displayTitle,
        displayDescription: displayInfo.displayDescription,
        arguments: toolArgs,
        result: toolResult,
        status: hasError ? "error" : "success",
        error: hasError ? String(rawItem.error) : undefined,
      });
    }
  }

  return micromanagerResult;
};
