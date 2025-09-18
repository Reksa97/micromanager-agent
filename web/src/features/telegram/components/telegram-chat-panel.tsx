"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, AlertCircle, Phone, PhoneOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StoredMessage } from "@/lib/conversations";
import { TIER_PERMISSIONS, type UserProfile } from "@/types/user";
import { useRealtimeAgent } from "@/features/chat/hooks/use-realtime-agent";
import type { ChatMessage } from "@/features/chat/types";

interface TelegramChatPanelEnhancedProps {
  userId: string;
  isAdmin: boolean;
  userName: string;
}

export function TelegramChatPanelEnhanced({
  userId,
  userName,
}: TelegramChatPanelEnhancedProps) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleRealtimeMessages = useCallback(
    (incoming: ChatMessage[]) => {
      if (incoming.length === 0) return;

      setMessages((prev) => {
        const existingIds = new Set(prev.map((msg) => msg.id).filter(Boolean));
        const mapped = incoming.map<StoredMessage>((message) => {
          const createdAtIso = message.createdAt ?? new Date().toISOString();
          const createdDate = new Date(createdAtIso);
          const type: StoredMessage["type"] =
            message.kind === "tool"
              ? "tool"
              : message.kind === "state"
              ? "state"
              : message.kind === "audio"
              ? "audio"
              : "text";

          return {
            id: message.id,
            userId,
            role: message.role,
            content: message.content,
            type,
            createdAt: createdDate,
            updatedAt: createdDate,
            source: message.role === "assistant" || message.role === "tool" ? "realtime-agent" : "telegram-user",
          } satisfies StoredMessage;
        });

        const deduped = mapped.filter((msg) => !msg.id || !existingIds.has(msg.id));
        if (deduped.length === 0) {
          return prev;
        }

        const next = [...prev, ...deduped];
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return next;
      });
    },
    [userId],
  );

  const realtime = useRealtimeAgent({
    onMessages: handleRealtimeMessages,
    onError: (voiceError) => {
      console.error("Realtime agent error:", voiceError);
      setError(voiceError.message);
    },
  });

  const voiceStateLabel = useMemo(() => {
    const state = realtime.voiceSignals.state;
    if (state === "idle") return "Idle";
    if (state === "listening") return "Listening";
    if (state === "processing") return "Processing";
    if (state === "speaking") return "Speaking";
    if (state === "connecting") return "Connecting";
    if (state === "executing") return "Executing";
    if (state === "ended") return "Ended";
    if (state === "error") return "Error";
    return state;
  }, [realtime.voiceSignals.state]);

  const isVoiceActive = realtime.isVoiceActive;

  // Load user profile and usage
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem("telegram-token");
        const response = await fetch("/api/user/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setProfile(data);
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
      }
    };

    loadProfile();
    // Refresh profile every minute
    const interval = setInterval(loadProfile, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load message history
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const token = localStorage.getItem("telegram-token");
        const response = await fetch("/api/telegram/chat/history", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Failed to load message history:", err);
      }
    };

    loadMessages();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: StoredMessage = {
      id: Date.now().toString(),
      content: input.trim(),
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      type: "text",
      userId: userId,
      source: "telegram-user",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("telegram-token");
      const response = await fetch("/api/telegram/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      const assistantMessage: StoredMessage = {
        id: Date.now().toString() + "-assistant",
        content: data.response,
        role: "assistant",
        createdAt: new Date(),
        updatedAt: new Date(),
        type: "text",
        userId: userId,
        source: "micromanager",
        metadata: {
          tokensUsed: data.tokensUsed,
        },
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update usage tracking
      if (data.tokensUsed) {
        await fetch("/api/user/usage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tokens: data.tokensUsed,
            messages: 1,
          }),
        });

        // Refresh profile to show updated usage
        const profileResponse = await fetch("/api/user/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          setProfile(updatedProfile);
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoice = async () => {
    if (!TIER_PERMISSIONS[profile?.tier ?? "free"].hasVoiceAccess) return;
    try {
      setError(null);
      if (isVoiceActive) {
        await realtime.stopSession();
      } else {
        await realtime.startSession();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to toggle voice session";
      setError(message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Usage Header */}
      <div className="border-b bg-card/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant={profile?.tier === "paid" ? "secondary" : "outline"}>
              {profile?.tier?.toUpperCase() || "FREE"}
            </Badge>
            <span className="text-sm font-medium">{userName}</span>
          </div>
          {TIER_PERMISSIONS[profile?.tier ?? "free"].hasVoiceAccess && (
            <Button
              size="sm"
              variant={isVoiceActive ? "destructive" : "default"}
              onClick={toggleVoice}
              className="gap-2"
            >
              {realtime.voiceSignals.state === "connecting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting
                </>
              ) : realtime.voiceSignals.state === "processing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing
                </>
              ) : isVoiceActive ? (
                <>
                  <PhoneOff className="h-4 w-4" />
                  End Call
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  Voice Call
                </>
              )}
            </Button>
          )}
        </div>
        {TIER_PERMISSIONS[profile?.tier ?? "free"].hasVoiceAccess && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className={cn("font-medium", isVoiceActive ? "text-foreground" : undefined)}>
              Voice agent: {voiceStateLabel}
            </span>
            {realtime.voiceSignals.transcript && (
              <span className="truncate">User: {realtime.voiceSignals.transcript}</span>
            )}
            {realtime.voiceSignals.agentSpeech && (
              <span className="truncate">Assistant: {realtime.voiceSignals.agentSpeech}</span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="whitespace-pre-wrap break-words text-sm">
                  {msg.content}
                </p>
                {msg.metadata?.tokensUsed && (
                  <div className="mt-1 flex items-center gap-1 opacity-60">
                    <Zap className="h-2.5 w-2.5" />
                    <span className="text-[10px]">
                      {msg.metadata.tokensUsed} tokens
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type your message..."
            disabled={isLoading}
            className="min-h-[44px] max-h-[200px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
