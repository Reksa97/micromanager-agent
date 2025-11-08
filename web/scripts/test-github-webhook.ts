#!/usr/bin/env tsx
/**
 * Test script for GitHub webhook
 * Simulates a GitHub PR webhook event to test local webhook handler
 *
 * Usage:
 *   npx tsx scripts/test-github-webhook.ts [pr_number] [action]
 *
 * Examples:
 *   npx tsx scripts/test-github-webhook.ts 35 opened
 *   npx tsx scripts/test-github-webhook.ts 35 ready_for_review
 *   npx tsx scripts/test-github-webhook.ts 35 closed  # (for merged PR)
 */

import { createHmac } from "crypto";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env" });

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const WEBHOOK_URL = "https://localhost:3000/api/github/webhook";

if (!WEBHOOK_SECRET) {
  console.error("❌ GITHUB_WEBHOOK_SECRET not found in .env");
  process.exit(1);
}

// Parse command line args
const prNumber = parseInt(process.argv[2] || "35", 10);
const action = process.argv[3] || "opened";

console.log(`🧪 Testing GitHub webhook for PR #${prNumber} with action: ${action}`);

// Create mock webhook payload
const payload = {
  action,
  pull_request: {
    number: prNumber,
    title: "Structured Context Schema & Progressive Nudge System",
    state: action === "closed" ? "closed" : "open",
    html_url: `https://github.com/Reksa97/micromanager-agent/pull/${prNumber}`,
    head: {
      sha: "b97101960620aee31b295cf7fd62eff91ed504da",
      ref: "dev",
    },
    base: {
      ref: "main",
    },
    user: {
      login: "Reksa97",
    },
    draft: false,
    merged: action === "closed" ? true : false,
  },
  repository: {
    full_name: "Reksa97/micromanager-agent",
    owner: {
      login: "Reksa97",
    },
  },
};

// Convert payload to string
const payloadString = JSON.stringify(payload);

// Calculate HMAC signature (same as GitHub does)
const hmac = createHmac("sha256", WEBHOOK_SECRET);
const signature = "sha256=" + hmac.update(payloadString).digest("hex");

console.log("📝 Payload:", JSON.stringify(payload, null, 2));
console.log("🔐 Signature:", signature);

// Send webhook request
async function sendWebhook() {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "pull_request",
        "X-Hub-Signature-256": signature,
        "X-GitHub-Delivery": crypto.randomUUID(),
      },
      body: payloadString,
    });

    const responseText = await response.text();

    if (response.ok) {
      console.log("✅ Webhook successful!");
      console.log("📬 Response:", responseText);
    } else {
      console.error("❌ Webhook failed!");
      console.error("Status:", response.status, response.statusText);
      console.error("Response:", responseText);
    }
  } catch (error) {
    console.error("❌ Error sending webhook:", error);
    console.error("\n💡 Make sure dev server is running on port 3000:");
    console.error("   npm run dev");
  }
}

sendWebhook();
