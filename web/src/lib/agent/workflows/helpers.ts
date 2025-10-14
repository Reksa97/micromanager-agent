import { getGoogleAccessToken } from "@/lib/google-tokens";
import { generateMcpToken } from "@/lib/mcp-auth";

export const getHostedMcpParams = async (userId: string, workflowRunId?: string) => {
  const googleAccessToken = await getGoogleAccessToken(userId);
  const mcpToken = await generateMcpToken(
    userId,
    googleAccessToken ?? undefined,
    undefined, // scopes
    workflowRunId
  );
  return {
    authorization: `Bearer ${mcpToken}`,
    headers: {
      Authorization: `Bearer ${mcpToken}`,
    },
    serverUrl: process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL,
  };
};
