import { AuditLogEntry } from "./utils";

export default function UserAuditLogList({
  logs,
  loading,
}: {
  logs: AuditLogEntry[];
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border p-4 bg-card shadow-sm">
      <h2 className="text-lg font-semibold mb-2">Agent Runs & Tool Calls</h2>

      {loading && <div className="text-muted-foreground text-sm">Loading...</div>}
      {!loading && logs.length === 0 && (
        <div className="text-muted-foreground text-sm">No logs available</div>
      )}

      <div className="space-y-3">
        {logs.map((log) => (
          <div
            key={log.id}
            className="p-3 border rounded-md hover:bg-muted/50 transition"
          >
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">{log.taskType}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(log.timestamp).toLocaleString()}
              </div>
            </div>

            <div className="text-xs text-muted-foreground mt-1">
              Model: <span className="text-foreground">{log.model}</span> · Duration:{" "}
              <span className="text-foreground">
                {((log.durationMs ?? 0) / 1000).toFixed(2)}s
              </span>
            </div>

            <div className="text-xs text-muted-foreground mt-1">
              Tools:{" "}
              {log.toolNames?.length ? (
                <span className="text-foreground">
                  {log.toolNames.join(", ")} ({log.toolCalls})
                </span>
              ) : (
                <span className="italic text-muted-foreground/80">none</span>
              )}
            </div>

            <div className="text-xs text-muted-foreground mt-1">
              Tokens: <span className="text-foreground">{log.totalTokens}</span> · Cost:{" "}
              <span className="text-foreground">${log.totalCost?.toFixed(5)}</span>
            </div>

            <div className="mt-2">
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  log.success
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {log.success ? "Success" : "Failed"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}