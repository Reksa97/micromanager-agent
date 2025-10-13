import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/db";

const COLLECTION = "usage_logs";

export interface UsageLog {
  _id?: ObjectId;
  userId: string;
  taskType: "chat" | "daily_check" | "reminder" | "workflow";
  source?: "telegram" | "web" | "api";

  // Token usage
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  // Cost (in EUR)
  inputCost: number;
  outputCost: number;
  totalCost: number;

  // Tool calls
  toolCalls?: number;
  toolNames?: string[];

  // Metadata
  model?: string;
  duration?: number; // milliseconds
  success: boolean;
  error?: string;

  createdAt: Date;
}

async function getUsageCollection() {
  const client = await getMongoClient();
  const col = client.db().collection<UsageLog>(COLLECTION);

  // Indexes for efficient queries
  await col.createIndex({ userId: 1, createdAt: -1 });
  await col.createIndex({ createdAt: -1 });
  await col.createIndex({ userId: 1, taskType: 1 });

  return col;
}

/**
 * Log API usage for a user
 */
export async function logUsage(log: Omit<UsageLog, "_id" | "createdAt">): Promise<void> {
  const collection = await getUsageCollection();

  await collection.insertOne({
    ...log,
    createdAt: new Date(),
  });
}

/**
 * Get user's usage stats
 */
export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number; // EUR
  totalToolCalls: number;

  // Breakdown by period
  today: {
    requests: number;
    tokens: number;
    cost: number;
  };
  thisWeek: {
    requests: number;
    tokens: number;
    cost: number;
    avgCostPerDay: number;
  };
  thisMonth: {
    requests: number;
    tokens: number;
    cost: number;
  };

  // Recent activity
  recentLogs: UsageLog[];
}

export async function getUserUsageStats(userId: string): Promise<UsageStats> {
  const collection = await getUsageCollection();
  const now = new Date();

  // Calculate time ranges
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Aggregate queries
  const [totalStats, todayStats, weekStats, monthStats, recentLogs] = await Promise.all([
    // Total all-time stats
    collection.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCost: { $sum: "$totalCost" },
          totalToolCalls: { $sum: { $ifNull: ["$toolCalls", 0] } },
        },
      },
    ]).toArray(),

    // Today
    collection.aggregate([
      { $match: { userId, createdAt: { $gte: startOfToday } } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          tokens: { $sum: "$totalTokens" },
          cost: { $sum: "$totalCost" },
        },
      },
    ]).toArray(),

    // This week
    collection.aggregate([
      { $match: { userId, createdAt: { $gte: startOfWeek } } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          tokens: { $sum: "$totalTokens" },
          cost: { $sum: "$totalCost" },
        },
      },
    ]).toArray(),

    // This month
    collection.aggregate([
      { $match: { userId, createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          tokens: { $sum: "$totalTokens" },
          cost: { $sum: "$totalCost" },
        },
      },
    ]).toArray(),

    // Recent logs
    collection.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray(),
  ]);

  type AggregateTotal = { totalRequests: number; totalTokens: number; totalCost: number; totalToolCalls: number };
  type AggregatePeriod = { requests: number; tokens: number; cost: number };

  const total: AggregateTotal = totalStats[0] as AggregateTotal || { totalRequests: 0, totalTokens: 0, totalCost: 0, totalToolCalls: 0 };
  const today: AggregatePeriod = todayStats[0] as AggregatePeriod || { requests: 0, tokens: 0, cost: 0 };
  const week: AggregatePeriod = weekStats[0] as AggregatePeriod || { requests: 0, tokens: 0, cost: 0 };
  const month: AggregatePeriod = monthStats[0] as AggregatePeriod || { requests: 0, tokens: 0, cost: 0 };

  // Calculate weekly average
  const daysInWeek = Math.max(1, Math.ceil((now.getTime() - startOfWeek.getTime()) / (1000 * 60 * 60 * 24)));
  const avgCostPerDay = week.cost / daysInWeek;

  return {
    totalRequests: total.totalRequests,
    totalTokens: total.totalTokens,
    totalCost: total.totalCost,
    totalToolCalls: total.totalToolCalls,
    today,
    thisWeek: {
      ...week,
      avgCostPerDay,
    },
    thisMonth: month,
    recentLogs,
  };
}

/**
 * Get global leaderboard (top users by usage)
 */
export interface LeaderboardEntry {
  userId: string;
  userName?: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  rank: number;
}

export async function getGlobalLeaderboard(limit = 10): Promise<{
  topUsers: LeaderboardEntry[];
  totalRealUsers: number;
}> {
  const client = await getMongoClient();
  const usageCol = client.db().collection<UsageLog>(COLLECTION);
  const usersCol = client.db().collection("users");

  // Aggregate usage by user
  const userStats = await usageCol.aggregate([
    { $match: { success: true } }, // Only successful requests
    {
      $group: {
        _id: "$userId",
        totalRequests: { $sum: 1 },
        totalTokens: { $sum: "$totalTokens" },
        totalCost: { $sum: "$totalCost" },
      },
    },
    { $sort: { totalRequests: -1 } },
    { $limit: limit },
  ]).toArray();

  // Get user names
  const userIds = userStats.map(u => u._id);
  const users = await usersCol.find({
    userId: { $in: userIds },
  }).toArray();

  const userMap = new Map(users.map(u => [u.userId || u._id.toString(), u]));

  // Build leaderboard with user names
  const topUsers: LeaderboardEntry[] = userStats.map((stat, index) => ({
    userId: stat._id,
    userName: userMap.get(stat._id)?.name || "Unknown",
    totalRequests: stat.totalRequests,
    totalTokens: stat.totalTokens,
    totalCost: stat.totalCost,
    rank: index + 1,
  }));

  // Count total real users (exclude mock users)
  const totalRealUsers = await usersCol.countDocuments({
    // Exclude mock users (test IDs like 888000001, 999888777, etc.)
    $and: [
      { telegramId: { $exists: true } },
      { telegramId: { $not: { $gte: 888000000, $lte: 999999999 } } },
    ],
  });

  return {
    topUsers,
    totalRealUsers,
  };
}

/**
 * Get user's rank in global leaderboard
 */
export async function getUserRank(userId: string): Promise<number | null> {
  const collection = await getUsageCollection();

  // Get user's total requests
  const userStats = await collection.aggregate([
    { $match: { userId, success: true } },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
      },
    },
  ]).toArray();

  if (!userStats.length) return null;

  const userRequests = userStats[0].totalRequests;

  // Count how many users have more requests
  const higherRanked = await collection.aggregate([
    { $match: { success: true } },
    {
      $group: {
        _id: "$userId",
        totalRequests: { $sum: 1 },
      },
    },
    {
      $match: {
        totalRequests: { $gt: userRequests },
      },
    },
    {
      $count: "count",
    },
  ]).toArray();

  const rank = (higherRanked[0]?.count || 0) + 1;
  return rank;
}

/**
 * Calculate cost based on model pricing (GPT-5 pricing)
 */
export function calculateCost(params: {
  inputTokens: number;
  outputTokens: number;
  model?: string;
}): { inputCost: number; outputCost: number; totalCost: number } {
  const { inputTokens, outputTokens, model = "gpt-5-0925" } = params;

  // Pricing in EUR (approximate conversion from USD)
  // GPT-5: $2.50 per 1M input tokens, $10 per 1M output tokens
  // 1 USD ≈ 0.92 EUR (approximate)
  const EUR_PER_USD = 0.92;

  let inputPricePerMillion = 2.5 * EUR_PER_USD;
  let outputPricePerMillion = 10 * EUR_PER_USD;

  // Adjust for other models if needed
  if (model.includes("gpt-4")) {
    inputPricePerMillion = 2.5 * EUR_PER_USD;
    outputPricePerMillion = 10 * EUR_PER_USD;
  } else if (model.includes("gpt-3.5")) {
    inputPricePerMillion = 0.5 * EUR_PER_USD;
    outputPricePerMillion = 1.5 * EUR_PER_USD;
  }

  const inputCost = (inputTokens / 1_000_000) * inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * outputPricePerMillion;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: Number(inputCost.toFixed(6)),
    outputCost: Number(outputCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
  };
}
