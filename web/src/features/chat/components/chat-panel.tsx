"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChat } from "@/features/chat/hooks/use-chat";
import { useRealtimeAgent } from "@/features/chat/hooks/use-realtime-agent";
import { MessageBubble } from "@/features/chat/components/message-bubble";
import { SessionControls } from "@/features/chat/components/session-controls";
import { VoiceVisualizer } from "@/features/chat/components/voice-visualizer";
import type { ChatMessage } from "@/features/chat/types";

export function ChatPanel() {
  const [input, setInput] = useState("");

  const {
    messages,
    isStreaming,
    isLoadingHistory,
    sendMessage,
    cancelStreaming,
  } = useChat({
    onError: (error) => toast.error(error.message),
  });

  const realtime = useRealtimeAgent({
    onError: (error) => toast.error(error.message),
  });

  const sortedMessages = useMemo(() => messages, [messages]);

  const transcriptText = realtime.voiceSignals.transcript?.trim();
  const assistantStreamingText = realtime.voiceSignals.agentSpeech?.trim();
  const assistantResponseText = realtime.voiceSignals.assistantResponse?.trim();
  const assistantOutput = assistantStreamingText || assistantResponseText;
  const reasoningText = realtime.voiceSignals.actionSummary?.trim();
  const assistantBadge = assistantStreamingText ? "Streaming" : assistantResponseText ? "Completed" : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await sendMessage(trimmed);
  };

  const handleCancel = () => {
    cancelStreaming();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card className="glass border border-border/70">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold">Operations Agent</CardTitle>
            <p className="text-sm text-muted-foreground">
              Coordinate tasks, surface blockers, and capture next steps in real time.
            </p>
          </div>
          {isStreaming && (
            <Button variant="outline" size="sm" onClick={handleCancel} className="gap-2 text-destructive">
              <Square className="h-4 w-4" />
              Stop streaming
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex h-[560px] flex-col">
          <ScrollArea className="flex-1 pr-4">
            <div className="flex flex-col gap-4 pb-6">
              {isLoadingHistory ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading history…
                </div>
              ) : sortedMessages.length === 0 ? (
                <div className="mx-auto flex h-44 w-full max-w-sm flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">No conversation yet</p>
                  <p>Start typing below or connect the voice agent to kick things off.</p>
                </div>
              ) : (
                sortedMessages.map((message: ChatMessage) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              )}
            </div>
          </ScrollArea>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            <Textarea
              placeholder="Ask the agent to coordinate something…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-h-[96px] resize-none"
              disabled={isStreaming}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Tip: mention owners and dates—Micromanager keeps track automatically.
              </p>
              <Button type="submit" disabled={isStreaming} className="gap-2">
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <SessionControls
          signals={realtime.voiceSignals}
          isVoiceActive={realtime.isVoiceActive}
          startSession={async () => {
            try {
              await realtime.startSession();
            } catch {
              // handled by hook toast
            }
          }}
          stopSession={async () => {
            await realtime.stopSession();
          }}
        />
        <VoiceVisualizer signals={realtime.voiceSignals} />
        <Card className="border border-border/60 bg-card/90 shadow-inner">
          <CardHeader>
            <CardTitle className="text-base">Realtime Highlights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RealtimeBucket
              title="Latest User Input"
              value={transcriptText}
              placeholder="Waiting for the microphone…"
            />
            <RealtimeBucket
              title="Assistant Output"
              value={assistantOutput}
              placeholder="The voice agent will respond here."
              badge={assistantBadge}
            />
            <RealtimeBucket
              title="Reasoning & Tool Use"
              value={reasoningText}
              placeholder="No tools invoked yet."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface RealtimeBucketProps {
  title: string;
  value?: string | null;
  placeholder: string;
  badge?: string;
}

function RealtimeBucket({ title, value, placeholder, badge }: RealtimeBucketProps) {
  const trimmed = value?.trim();
  const display = trimmed && trimmed.length > 0 ? trimmed : undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        {badge ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="min-h-[120px] rounded-2xl border border-border/50 bg-muted/20 px-3 py-3 shadow-inner">
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm leading-relaxed transition-colors",
            display ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          {display ?? placeholder}
        </p>
      </div>
    </div>
  );
}
