"use client";

import { useCallback } from "react";
import { Headphones, Loader2, PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VoiceSessionSignals } from "@/features/chat/types";

interface SessionControlsProps {
  signals: VoiceSessionSignals;
  isVoiceActive: boolean;
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
}

export function SessionControls({ signals, isVoiceActive, startSession, stopSession }: SessionControlsProps) {
  const handleClick = useCallback(async () => {
    if (isVoiceActive) {
      await stopSession();
    } else {
      await startSession();
    }
  }, [isVoiceActive, startSession, stopSession]);

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Realtime Voice Agent</p>
          <p className="text-xs text-muted-foreground">
            {isVoiceActive ? "Connected to GPT Realtime" : "Click start to establish a live session"}
          </p>
        </div>
        <Button
          size="lg"
          variant={isVoiceActive ? "secondary" : "default"}
          className={cn(
            "flex items-center gap-2 rounded-full px-6",
            isVoiceActive && "border border-border bg-background/60 text-foreground",
          )}
          onClick={handleClick}
        >
          {signals.state === "connecting" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isVoiceActive ? (
            <PowerOff className="h-4 w-4" />
          ) : (
            <Headphones className="h-4 w-4" />
          )}
          {isVoiceActive ? "End Session" : "Start Voice Agent"}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <StatusChip label="Listening" active={signals.state === "listening"} />
        <StatusChip label="Thinking" active={signals.state === "processing"} />
        <StatusChip label="Speaking" active={signals.state === "speaking"} />
      </div>
    </div>
  );
}

function StatusChip({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 rounded-full border border-border/60 px-3 py-1",
        active ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-primary" : "bg-muted-foreground/40")} />
      {label}
    </div>
  );
}
