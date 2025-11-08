/**
 * GitHub App Authentication
 *
 * Handles authentication for GitHub App installation
 */

import { env } from "@/env";
import { createPrivateKey, createSign } from "crypto";

// Cache for installation access token
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Generate JWT for GitHub App authentication
 */
function generateJWT(): string {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error("GitHub App credentials not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds in the past to account for clock drift
    exp: now + 600, // Expires in 10 minutes
    iss: env.GITHUB_APP_ID,
  };

  // Create JWT header
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");

  // Create JWT payload
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );

  // Sign the JWT
  const privateKey = createPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payloadEncoded}`);
  sign.end();
  const signature = sign.sign(privateKey, "base64url");

  return `${header}.${payloadEncoded}.${signature}`;
}

/**
 * Get installation ID for a repository
 */
async function getInstallationId(repoFullName: string): Promise<number> {
  const jwt = generateJWT();
  const [owner, repo] = repoFullName.split("/");

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/installation`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to get installation ID: ${response.status} - ${error}`
    );
  }

  const installation = await response.json();
  return installation.id;
}

/**
 * Get installation access token
 * Caches the token and refreshes when needed
 */
export async function getGitHubAppToken(
  repoFullName: string
): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const jwt = generateJWT();
  const installationId = await getInstallationId(repoFullName);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to get installation access token: ${response.status} - ${error}`
    );
  }

  const data = await response.json();

  // Cache the token
  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return data.token;
}
