import { NextResponse } from "next/server";
import { getUsageLogsForUser } from "@/lib/audit";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await context.params;

  try {
    const usageLogs = await getUsageLogsForUser(userId);

    const filteredLogs = usageLogs.map((log: any) => ({
      id: log._id?.toString(),
      timestamp: log.createdAt,
      durationMs: log.duration,
      taskType: log.taskType,
      model: log.model,
      success: log.success,
      source: log.source,
      toolCalls: log.toolCalls,
      toolNames: log.toolNames || [],
      totalTokens: log.totalTokens,
      totalCost: log.totalCost,
    }));

    return NextResponse.json({
      success: true,
      count: filteredLogs.length,
      logs: filteredLogs,
    });
  } catch (error) {
    console.error("[Admin Logs API] Failed to fetch user logs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load logs" },
      { status: 500 }
    );
  }
}