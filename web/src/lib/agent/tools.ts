import { hostedMcpTool, Tool, tool } from "@openai/agents";
import { z } from "zod";

export const getWeatherTool = tool({
  name: "get_weather",
  description: "Get the weather for a given city",
  parameters: z.object({ city: z.string() }),
  async execute({ city }) {
    return `The weather in ${city} is sunny and 25 degrees Celsius.`;
  },
});

export const micromanagerMCP = (userId: string, googleAccessToken?: string | null) => {
  if (!process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL) {
    throw new Error("MICROMANAGER_MCP_SERVER_URL is not set");
  }
  console.log(
    "Using MCP server",
    process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL,
    {
      userId,
      hasGoogleToken: !!googleAccessToken,
    }
  );

  // Use simple token auth like origin/main
  const auth = `Bearer __TEST_VALUE__`;
  return hostedMcpTool({
    serverLabel: "micromanager",
    serverUrl: process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL,
    authorization: auth,
    headers: {
      "user-id": userId,
      "google-access-token": googleAccessToken ?? "",
      authorization: auth,
    },
  });
};

export const getFrontendTools = (userId: string, googleAccessToken?: string | null): Tool[] => {
  return [micromanagerMCP(userId, googleAccessToken), getWeatherTool];
};
