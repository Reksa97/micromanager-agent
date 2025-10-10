import { hostedMcpTool, Tool } from "@openai/agents";

export const micromanagerMCP = (mcpAuthToken: string) => {
  if (!process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL) {
    throw new Error("MICROMANAGER_MCP_SERVER_URL is not set");
  }
  console.log(
    "Using MCP server",
    process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL,
    {
      mcpAuthToken: mcpAuthToken.substring(0, 6) + "...",
    }
  );
  if (!mcpAuthToken) {
    throw new Error("MCP authentication token is required");
  }
  return hostedMcpTool({
    serverLabel: "micromanager",
    serverUrl: process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL,
    authorization: mcpAuthToken,
    headers: {
      authorization: `Bearer ${mcpAuthToken}`,
    },
  });
};

export const getFrontendTools = (mcpAuthToken: string): Tool[] => {
  return [micromanagerMCP(mcpAuthToken)];
};
