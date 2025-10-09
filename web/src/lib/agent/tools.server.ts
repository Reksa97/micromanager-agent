import { Tool } from "@openai/agents";
import { getWeatherTool, micromanagerMCP } from "./tools";
import { getGoogleAccessToken } from "@/lib/google-tokens";

export const getBackendTools = async (
  userId: string,
  googleAccessTokenOverride?: string | null
) => {
  console.log("Registering tools for", userId);

  // Fallback chain for Google access token:
  // 1. Use override from session (if provided)
  // 2. Fetch from DB with auto-refresh (preferred for schedulers/webhooks)
  // 3. Fallback to env var for development
  let googleAccessToken = googleAccessTokenOverride;

  if (!googleAccessToken) {
    console.log(
      "No session token override, fetching from DB for user:",
      userId
    );
    googleAccessToken = await getGoogleAccessToken(userId);

    if (googleAccessToken) {
      console.log("Successfully fetched Google token from DB");
    }
  }

  if (!googleAccessToken) {
    console.log("No DB token found, falling back to env var");
    googleAccessToken =
      process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING ?? null;
  }

  console.log("Registering backend tools for user:", {
    userId,
    hasGoogleToken: !!googleAccessToken,
  });

  const tools: Tool[] = [
    getWeatherTool,
    micromanagerMCP(userId, googleAccessToken ?? undefined),
  ];
  return tools;
};
