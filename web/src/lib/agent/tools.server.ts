import { Tool } from "@openai/agents";
import { micromanagerMCP } from "./tools";
import { generateMcpToken } from "../mcp-auth";
import { getGoogleAccessToken } from "../google-tokens";
import { createWorkplanTool } from "./workplan-tool.server";

export const getBackendTools = async (userId: string) => {
  console.log("Registering backend tools for", userId);

  const googleAccessToken = (await getGoogleAccessToken(userId)) ?? undefined;
  const mcpAuthToken = await generateMcpToken(userId, googleAccessToken);

  const tools: Tool[] = [
    createWorkplanTool(userId),
    micromanagerMCP(mcpAuthToken),
  ];
  return tools;
};
