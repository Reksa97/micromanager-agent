"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GitBranch, Clock, Code, ChevronDown, ChevronUp } from "lucide-react";

interface BuildInfoProps {
  className?: string;
  variant?: "compact" | "detailed";
}

export function BuildInfo({ className, variant = "compact" }: BuildInfoProps) {
  const [expanded, setExpanded] = useState(false);

  const gitHash = process.env.NEXT_PUBLIC_GIT_HASH ?? "dev";
  const gitBranch = process.env.NEXT_PUBLIC_GIT_BRANCH ?? "unknown";
  const buildTime =
    process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString();
  const buildEnv = process.env.NEXT_PUBLIC_BUILD_ENV ?? "development";

  // Format build time
  const formatBuildTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const timeAgo = formatBuildTime(buildTime);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-[10px] text-muted-foreground/70 font-mono select-none cursor-default",
          "hover:text-muted-foreground transition-colors",
          className
        )}
        onClick={() => setExpanded(!expanded)}
        title={`Branch: ${gitBranch}\nCommit: ${gitHash}\nBuilt: ${new Date(
          buildTime
        ).toLocaleString()}\nEnv: ${buildEnv}`}
      >
        <Code className="h-3 w-3" />
        <span>{gitHash}</span>
        <span className="text-muted-foreground/50">•</span>
        <span>{timeAgo}</span>
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border bg-card/50 p-2 text-xs space-y-1",
        className
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <GitBranch className="h-3 w-3" />
        <span className="font-medium">Branch:</span>
        <span className="font-mono">{gitBranch}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Code className="h-3 w-3" />
        <span className="font-medium">Commit:</span>
        <span className="font-mono">{gitHash}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span className="font-medium">Built:</span>
        <span>{timeAgo}</span>
        <span className="text-muted-foreground/50">
          ({new Date(buildTime).toLocaleString()})
        </span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="font-medium">Env:</span>
        <span
          className={cn(
            "font-mono",
            buildEnv === "production" ? "text-green-600" : "text-yellow-600"
          )}
        >
          {buildEnv}
        </span>
      </div>
    </div>
  );
}
