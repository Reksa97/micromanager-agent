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

export const micromanagerMCP = (userId: string, authorization?: string) => {
  if (!process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL) {
    throw new Error("MICROMANAGER_MCP_SERVER_URL is not set");
  }
  console.log(
    "Using MCP server",
    process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL
  );
  return hostedMcpTool({
    serverLabel: "micromanager",
    serverUrl: process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL,
    authorization,
    headers: {
      "user-id": userId,
    },
  });
};

export const getFrontendTools = (
  userId: string,
  authorization?: string
): Tool[] => {
  return [micromanagerMCP(userId, authorization), getWeatherTool];
};
