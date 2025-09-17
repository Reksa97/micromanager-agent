import { motion } from "framer-motion";
import { Mic, Ear, Activity, Zap, PauseCircle } from "lucide-react";

import type { VoiceSessionSignals } from "@/features/chat/types";
import { cn } from "@/lib/utils";

const STATE_META: Record<VoiceSessionSignals["state"], { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  idle: { label: "Idle", icon: PauseCircle, tint: "from-muted to-muted" },
  connecting: { label: "Connecting", icon: Activity, tint: "from-primary/60 to-primary/20" },
  listening: { label: "Listening", icon: Ear, tint: "from-emerald-400/60 to-emerald-500/20" },
  processing: { label: "Processing", icon: Activity, tint: "from-blue-500/60 to-blue-600/20" },
  speaking: { label: "Speaking", icon: Mic, tint: "from-purple-500/60 to-purple-600/20" },
  executing: { label: "Executing", icon: Zap, tint: "from-amber-500/60 to-amber-600/20" },
  ended: { label: "Ended", icon: PauseCircle, tint: "from-muted to-muted" },
  error: { label: "Error", icon: Activity, tint: "from-destructive/70 to-destructive/30" },
};

interface VoiceVisualizerProps {
  signals: VoiceSessionSignals;
}

export function VoiceVisualizer({ signals }: VoiceVisualizerProps) {
  const meta = STATE_META[signals.state] ?? STATE_META.idle;
  const Icon = meta.icon;

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-6 shadow-lg">
      <div className="relative h-36 w-36">
        <div
          className={cn(
            "absolute inset-0 rounded-full bg-gradient-to-br blur-xl transition-colors", meta.tint,
          )}
        />
        <motion.div
          className="absolute inset-4 rounded-full border border-primary/40"
          animate={{
            boxShadow: signals.state === "speaking"
              ? [
                  "0 0 0 0 rgba(129, 140, 248, 0.4)",
                  "0 0 0 14px rgba(129, 140, 248, 0)",
                ]
              : "0 0 0 0 rgba(129, 140, 248, 0)",
          }}
          transition={{ duration: 1.6, repeat: signals.state === "speaking" ? Infinity : 0, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-6 rounded-full border border-border/40"
          animate={{ rotate: signals.state === "processing" ? 360 : 0 }}
          transition={{ repeat: signals.state === "processing" ? Infinity : 0, ease: "linear", duration: 4 }}
        />
        <motion.div
          className="relative z-10 flex h-full items-center justify-center rounded-full bg-background/80 backdrop-blur"
          animate={{
            scale: signals.state === "listening" ? [1, 1.08, 1] : 1,
          }}
          transition={{ repeat: signals.state === "listening" ? Infinity : 0, duration: 1.2 }}
        >
          <Icon className="h-12 w-12 text-primary" />
        </motion.div>
      </div>
      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">Voice Session</span>
        <p className="text-lg font-semibold text-foreground">{meta.label}</p>
        {signals.agentSpeech && (
          <motion.p
            key={signals.agentSpeech}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-sm text-sm text-muted-foreground"
          >
            “{signals.agentSpeech}”
          </motion.p>
        )}
        {!signals.agentSpeech && signals.transcript && (
          <motion.p
            key={signals.transcript}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-sm text-sm text-muted-foreground"
          >
            You: {signals.transcript}
          </motion.p>
        )}
        {signals.error && <p className="text-xs text-destructive">{signals.error}</p>}
      </div>
    </div>
  );
}
