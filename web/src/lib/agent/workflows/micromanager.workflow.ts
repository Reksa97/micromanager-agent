import { hostedMcpTool, Agent, AgentInputItem, Runner } from "@openai/agents";
import { getHostedMcpParams } from "./helpers";
import { logUsage, calculateCost } from "@/lib/usage-tracking";

type WorkflowInput = { input_as_text: string; user_id: string; source?: "telegram" | "web" | "api" };

// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
  // Tool definitions
  const mcp = hostedMcpTool({
    serverLabel: "micromanager_mcp",
    allowedTools: [
      "get_user_context",
      "update_user_context",
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
      "You are a helpful micromanager who wants to learn about the user constantly. Use the available tools to understand the user context before sending them a short, personalised message. If the user asks you to do something, even if it is unclear, do something useful. Never just ask for confirmation or a clarification, always do something useful. Keep the writable user context concise and add details there when you learn something from tool usage or from the user messages.",
    model: "gpt-5",
    tools: [mcp],
    modelSettings: {
      reasoning: {
        effort: "medium",
        summary: "auto",
      },
      store: true,
    },
  });
  const conversationHistory: AgentInputItem[] = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: workflow.input_as_text,
        },
      ],
    },
  ];
  const runner = new Runner({
    traceMetadata: {
      __trace_source__: "agent-builder",
      workflow_id: "wf_68e8187e5a54819088e2c66b9759dfad05894cb3d3f82dfb",
    },
  });
  const micromanagerResultTemp = await runner.run(micromanager, [
    ...conversationHistory,
  ]);
  conversationHistory.push(
    ...micromanagerResultTemp.newItems.map((item) => item.rawItem)
  );

  if (!micromanagerResultTemp.finalOutput) {
    throw new Error("Agent result is undefined");
  }

  const micromanagerResult = {
    output_text: micromanagerResultTemp.finalOutput ?? "",
  };

  // Log usage for tracking
  try {
    // Extract usage from result - try to get from providerData or estimate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultAny = micromanagerResultTemp as any;
    const usage = resultAny.usage || {};

    // Estimate tokens if not available
    const inputTokens = usage.input_tokens || Math.ceil(workflow.input_as_text.length / 4);
    const outputTokens = usage.output_tokens || Math.ceil((micromanagerResultTemp.finalOutput?.length || 0) / 4);
    const totalTokens = inputTokens + outputTokens;

    const cost = calculateCost({
      inputTokens,
      outputTokens,
      model: "gpt-5-0925",
    });

    // Count tool calls from newItems
    const toolCalls = micromanagerResultTemp.newItems.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item => (item.rawItem as any).type === "hosted_tool_call"
    ).length;

    // Extract tool names from hosted_tool_call items
    const toolNames = micromanagerResultTemp.newItems
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter(item => (item.rawItem as any).type === "hosted_tool_call")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(item => (item.rawItem as any).name || "unknown")
      .filter((name, index, arr) => arr.indexOf(name) === index); // unique

    await logUsage({
      userId: workflow.user_id,
      taskType: "workflow",
      source: workflow.source || "api",
      inputTokens,
      outputTokens,
      totalTokens,
      ...cost,
      toolCalls,
      toolNames,
      model: "gpt-5-0925",
      success: true,
    });
  } catch (error) {
    console.error("Failed to log usage:", error);
    // Don't fail the workflow if logging fails
  }

  return micromanagerResult;
};
