import { hostedMcpTool, Tool } from "@openai/agents";
import { getWeatherTool, micromanagerMCP } from "./tools";

export const getBackendTools = (
  userId: string,
  googleAccessToken: string | null | undefined
) => {
  console.log("Registering tools for", userId);
  const tools: Tool[] = [getWeatherTool, micromanagerMCP(userId, undefined)];
  if (googleAccessToken) {
    console.log("Adding Google Calendar tool with authenticated user's token");
    tools.push(
      hostedMcpTool({
        serverLabel: "google_calendar",
        connectorId: "connector_googlecalendar",
        requireApproval: "never",
        authorization: googleAccessToken,
      })
    );
  } else if (process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING) {
    // https://platform.openai.com/docs/guides/tools-connectors-mcp
    // https://openai.github.io/openai-agents-js/guides/mcp/
    // Get your personal access token for Google Calendar
    // 1. Visit https://developers.google.com/oauthplayground/
    // 2. Input https://www.googleapis.com/auth/calendar.events as the required scope
    // 3. Grab the acccess token starting with "ya29."
    console.log("Adding Google Calendar tool with test token");
    tools.push(
      hostedMcpTool({
        serverLabel: "google_calendar",
        connectorId: "connector_googlecalendar",
        requireApproval: "never",
        authorization: process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING,
      })
    );
  }
  return tools;
};
