import { google } from "googleapis";
import { getMongoClient } from "@/lib/db";
import { env } from "@/env";

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in seconds
}

interface GoogleAccountDocument {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

/**
 * Check if access token is expired with 5-minute buffer
 */
export function isTokenExpired(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const bufferSeconds = 5 * 60; // 5 minutes
  return now >= expiresAt - bufferSeconds;
}

/**
 * Refresh Google access token using refresh token
 */
async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  try {
    const oAuth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    oAuth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oAuth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("No access token returned from refresh");
    }

    const expiresAt =
      credentials.expiry_date
        ? Math.floor(credentials.expiry_date / 1000)
        : Math.floor(Date.now() / 1000) + 3600; // Default 1 hour

    return {
      accessToken: credentials.access_token,
      expiresAt,
    };
  } catch (error) {
    console.error("Failed to refresh Google access token:", error);
    throw new Error(
      `Token refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get Google tokens for a user from DB accounts collection
 * Automatically refreshes if expired
 */
export async function getUserGoogleTokens(
  userId: string
): Promise<GoogleTokens | null> {
  try {
    const client = await getMongoClient();
    const accountsCollection =
      client.db().collection<GoogleAccountDocument>("accounts");

    // Find Google account for this user
    const account = await accountsCollection.findOne({
      userId,
      provider: "google",
    });

    if (!account) {
      console.log(`No Google account found for user ${userId}`);
      return null;
    }

    // Check if token is expired
    if (isTokenExpired(account.expires_at)) {
      console.log(`Access token expired for user ${userId}, refreshing...`);

      // Refresh the token
      const { accessToken, expiresAt } = await refreshGoogleAccessToken(
        account.refresh_token
      );

      // Update DB with new token
      await accountsCollection.updateOne(
        { userId, provider: "google" },
        {
          $set: {
            access_token: accessToken,
            expires_at: expiresAt,
          },
        }
      );

      console.log(`Successfully refreshed token for user ${userId}`);

      return {
        accessToken,
        refreshToken: account.refresh_token,
        expiresAt,
      };
    }

    // Token is still valid
    return {
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
    };
  } catch (error) {
    console.error(`Failed to get Google tokens for user ${userId}:`, error);
    return null;
  }
}

/**
 * Force refresh Google access token and update DB
 * Useful for testing or when you know the token is invalid
 */
export async function refreshUserGoogleToken(
  userId: string
): Promise<GoogleTokens | null> {
  try {
    const client = await getMongoClient();
    const accountsCollection =
      client.db().collection<GoogleAccountDocument>("accounts");

    const account = await accountsCollection.findOne({
      userId,
      provider: "google",
    });

    if (!account) {
      console.log(`No Google account found for user ${userId}`);
      return null;
    }

    // Force refresh
    const { accessToken, expiresAt } = await refreshGoogleAccessToken(
      account.refresh_token
    );

    // Update DB
    await accountsCollection.updateOne(
      { userId, provider: "google" },
      {
        $set: {
          access_token: accessToken,
          expires_at: expiresAt,
        },
      }
    );

    console.log(`Forced token refresh for user ${userId}`);

    return {
      accessToken,
      refreshToken: account.refresh_token,
      expiresAt,
    };
  } catch (error) {
    console.error(`Failed to force refresh token for user ${userId}:`, error);
    return null;
  }
}

/**
 * Get Google access token with automatic refresh
 * Convenience function that returns just the access token
 */
export async function getGoogleAccessToken(
  userId: string
): Promise<string | null> {
  const tokens = await getUserGoogleTokens(userId);
  return tokens?.accessToken ?? null;
}
