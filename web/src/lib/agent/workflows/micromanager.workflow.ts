import { hostedMcpTool, Agent, AgentInputItem, Runner } from "@openai/agents";
import { getHostedMcpParams } from "./helpers";

type WorkflowInput = { input_as_text: string; user_id: string };

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
    model: "gpt-5-mini",
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
  return micromanagerResult;
};
