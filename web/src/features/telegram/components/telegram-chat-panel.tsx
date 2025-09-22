"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Send, Loader2, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StoredMessage } from "@/lib/conversations";
import { TIER_PERMISSIONS, type UserProfile } from "@/types/user";
import { useRealtimeAgent } from "@/features/chat/hooks/use-realtime-agent";
import type { ChatMessage } from "@/features/chat/types";

const DEFAULT_CONFIG_ITEMS = [] as const;

const DEFAULT_TICKER_CONTENT = {
  user: "-",
  assistant: "Micromanaging...",
  tools: "...",
} as const;

interface TelegramChatPanelProps {
  userId: string;
  userName: string;
}

export function TelegramChatPanel({
  userId,
  userName,
}: TelegramChatPanelProps) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleRealtimeMessages = useCallback(
    (incoming: ChatMessage[]) => {
      if (incoming.length === 0) return;

      setMessages((prev) => {
        const existingIds = new Set(prev.map((msg) => msg.id).filter(Boolean));
        const mapped = incoming.map<StoredMessage>((message) => {
          const createdAtIso = message.createdAt ?? new Date().toISOString();
          const createdDate = new Date(createdAtIso);
          const type: StoredMessage["type"] = "text";

          return {
            id: message.id,
            userId,
            role: message.role,
            content: message.content,
            type,
            createdAt: createdDate,
            updatedAt: createdDate,
            source:
              message.role === "assistant" || message.role === "tool"
                ? "realtime-agent"
                : "telegram-user",
          } satisfies StoredMessage;
        });

        const deduped = mapped.filter(
          (msg) => !msg.id || !existingIds.has(msg.id)
        );
        if (deduped.length === 0) {
          return prev;
        }

        const next = [...prev, ...deduped];
        next.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return next;
      });
    },
    [userId]
  );

  const realtime = useRealtimeAgent({
    onMessages: handleRealtimeMessages,
    onError: (voiceError) => {
      console.error("Realtime agent error:", voiceError);
      setError(voiceError.message);
    },
    getAuthToken: () => localStorage.getItem("telegram-token"),
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
  const displayIdentity = profile?.email ?? userName;

  const lastUserMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "user") {
        return message.content;
      }
    }
    return null;
  }, [messages]);

  const lastAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant") {
        return message.content;
      }
    }
    return null;
  }, [messages]);

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
        body: JSON.stringify({
          message: userMessage.content,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      const metadata: StoredMessage["metadata"] = {};
      if (typeof data.tokensUsed === "number") {
        metadata.tokensUsed = data.tokensUsed;
      }
      if (
        typeof data.reasoning === "string" &&
        data.reasoning.trim().length > 0
      ) {
        metadata.reasoning = data.reasoning.trim();
      }

      const assistantMessage: StoredMessage = {
        id: Date.now().toString() + "-assistant",
        content: data.response,
        role: "assistant",
        createdAt: new Date(),
        updatedAt: new Date(),
        type: "text",
        userId: userId,
        source: "micromanager",
        metadata: Object.keys(metadata).length ? metadata : undefined,
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
      const message =
        err instanceof Error ? err.message : "Failed to toggle voice session";
      setError(message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="bg-card/60 px-3 py-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <Badge
                variant={profile?.tier === "paid" ? "secondary" : "outline"}
              >
                {profile?.tier?.toUpperCase() || "FREE"}
              </Badge>
              <span className="text-sm font-medium text-foreground">
                {displayIdentity}
              </span>
              {voiceStateLabel !== "Idle" && (
                <span
                  className={cn(
                    "font-medium text-xs ",
                    isVoiceActive ? "text-foreground" : undefined
                  )}
                >
                  Voice agent: {voiceStateLabel}
                </span>
              )}
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
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {realtime.voiceSignals.transcript ? (
                  <span className="truncate">
                    User: {realtime.voiceSignals.transcript}
                  </span>
                ) : null}
                {realtime.voiceSignals.agentSpeech ? (
                  <span className="truncate">
                    Assistant: {realtime.voiceSignals.agentSpeech}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="bg-background/80 p-3 pb-6 shadow-sm"
          >
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                placeholder="Type your message..."
                disabled={isLoading}
                className="min-h-[44px] max-h-[200px] flex-1 resize-none rounded-lg border bg-background px-6 pt-[10px] text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
                className="min-h-[44px] min-w-[44px] rounded-lg"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 pb-4">
          <StatusTickerSection
            userText={lastUserMessage ?? DEFAULT_TICKER_CONTENT.user}
            assistantText={
              lastAssistantMessage ?? DEFAULT_TICKER_CONTENT.assistant
            }
          />
          <DefaultConfigSquare />
        </div>
      </div>
    </div>
  );
}

function DefaultConfigSquare() {
  return (
    <div className="aspect-square w-full bg-muted/10 p-4">
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {DEFAULT_CONFIG_ITEMS.map((item) => (
            <span
              key={item}
              className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

interface StatusTickerSectionProps {
  userText: string;
  assistantText: string;
}

function StatusTickerSection({
  userText,
  assistantText,
}: StatusTickerSectionProps) {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 animate-gradient-slow bg-[linear-gradient(120deg,hsl(var(--primary)/0.2),hsl(var(--accent)/0.1),hsl(var(--secondary)/0.25))]" />
      <div className="pointer-events-none absolute inset-x-0 top-[33%] h-[67%] animate-gradient-slow bg-[linear-gradient(300deg,hsl(var(--secondary)/0.35),hsl(var(--accent)/0.25),hsl(var(--primary)/0.35))]" />
      <div className="relative z-10 space-y-1 px-0 py-1">
        <TickerRow label="User" text={userText} />
        <TickerRow
          label="Micromanager"
          text={assistantText}
          direction="reverse"
        />
        <TickerRow label="Tools" text="..." direction="reverse" />
      </div>
    </div>
  );
}

interface TickerRowProps {
  label: string;
  text: string;
  direction?: "forward" | "reverse";
}

function TickerRow({ label, text, direction = "forward" }: TickerRowProps) {
  return (
    <div className="flex flex-col gap-1 px-4 py-4">
      <span
        className={`text-[10px] h-4 font-semibold text-nowrap uppercase tracking-widest flex flex-row text-muted-foreground/80 ${
          direction === "reverse"
            ? "animate-slide-right justify-between"
            : "animate-slide-left gap-4"
        }`}
      >
        <div className={`mr-4`}>{label}</div>
        <div className={`overflow-y- overflow-x-scroll h-4`}>{text}</div>
      </span>
    </div>
  );
}
