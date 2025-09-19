"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Send,
  Loader2,
  AlertCircle,
  Phone,
  PhoneOff,
  Zap,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StoredMessage } from "@/lib/conversations";
import { TIER_PERMISSIONS, type UserProfile } from "@/types/user";
import { useRealtimeAgent } from "@/features/chat/hooks/use-realtime-agent";
import type { ChatMessage } from "@/features/chat/types";

const DEFAULT_CONFIG_ITEMS = [
  "Assign owners & due dates",
  "Capture meeting notes",
  "Summarize latest updates",
] as const;

const DEFAULT_TICKER_CONTENT = {
  user: "Describe what you need Micromanager to handle",
  assistant: "Micromanager drafts your plan in real time",
  tools: "Automations fire here when tools are engaged",
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
  const [error, setError] = useState<string | null>(null);
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

  const lastReasoningSnippet = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const reasoning = message.metadata?.reasoning;
      if (typeof reasoning === "string" && reasoning.trim().length > 0) {
        return reasoning.trim();
      }
    }
    return null;
  }, [messages]);

  const lastToolMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "tool" || message.type === "tool") {
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
      <div className="border-b bg-card/60 px-3 py-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={profile?.tier === "paid" ? "secondary" : "outline"}
              >
                {profile?.tier?.toUpperCase() || "FREE"}
              </Badge>
              <span className="text-sm font-medium text-foreground">
                {displayIdentity}
              </span>
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
              <span
                className={cn(
                  "font-medium",
                  isVoiceActive ? "text-foreground" : undefined
                )}
              >
                Voice agent: {voiceStateLabel}
              </span>
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
            className="space-y-2 rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm"
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
                className="min-h-[44px] max-h-[200px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
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
            toolText={
              lastToolMessage ??
              lastReasoningSnippet ??
              DEFAULT_TICKER_CONTENT.tools
            }
          />
          <DefaultConfigSquare />
          <div className="relative">
            <div className="aspect-square w-full overflow-hidden rounded-3xl border border-border/70 bg-card/80 shadow-inner">
              <ScrollArea ref={scrollRef} className="h-full w-full">
                <div className="flex h-full flex-col gap-4 p-4">
                  <div className="flex-1 space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="flex max-w-xs flex-col items-center gap-2 text-center text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Square ready for Micromanager
                          </span>
                          <span>
                            Your assistant will render plans here once you start
                            the conversation.
                          </span>
                        </div>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.role === "user"
                              ? "justify-end"
                              : "justify-start"
                          )}
                        >
                          {msg.role === "assistant" ? (
                            <AssistantBubble message={msg} />
                          ) : (
                            <div
                              className={cn(
                                "max-w-[80%] rounded-lg px-4 py-2",
                                "bg-primary text-primary-foreground"
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words text-sm">
                                {msg.content}
                              </p>
                              {(() => {
                                const tokensUsed = msg.metadata?.tokensUsed;
                                if (typeof tokensUsed === "number") {
                                  return (
                                    <div className="mt-1 flex items-center gap-1 opacity-60">
                                      <Zap className="h-2.5 w-2.5" />
                                      <span className="text-[10px]">
                                        {tokensUsed} tokens
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="rounded-lg bg-muted px-4 py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      </div>
                    )}
                  </div>
                  {error && (
                    <div className="flex justify-center">
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultConfigSquare() {
  return (
    <div className="aspect-square w-full rounded-3xl border border-dashed border-border/70 bg-muted/10 p-4">
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Default workspace
          </span>
          <p className="text-sm text-muted-foreground/80">
            Micromanager starts new users with a focused trio of tools.
          </p>
        </div>
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
  toolText: string;
}

function StatusTickerSection({
  userText,
  assistantText,
  toolText,
}: StatusTickerSectionProps) {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 animate-gradient-slow bg-[linear-gradient(120deg,hsl(var(--primary)/0.2),hsl(var(--accent)/0.1),hsl(var(--secondary)/0.25))]" />
      <div className="relative space-y-1 px-0 py-1">
        <TickerRow label="Latest user" text={userText} />
        <TickerRow label="Assistant" text={assistantText} direction="reverse" />
        <TickerRow label="Tool usage" text={toolText} />
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
    <div className="flex flex-col gap-1 px-4">
      <span
        className={`text-[10px] font-semibold uppercase tracking-widest  text-muted-foreground/80 ${
          direction === "reverse"
            ? "animate-slide-right text-right"
            : "animate-slide-left text-left"
        }`}
      >
        {label} {text}
      </span>
    </div>
  );
}

interface AssistantBubbleProps {
  message: StoredMessage;
}

function AssistantBubble({ message }: AssistantBubbleProps) {
  const reasoning =
    typeof message.metadata?.reasoning === "string"
      ? message.metadata.reasoning
      : undefined;

  return (
    <div className="max-w-[80%] space-y-2 rounded-lg bg-muted px-4 py-3">
      <p className="whitespace-pre-wrap break-words text-sm text-foreground">
        {message.content || "(no response)"}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {(() => {
          const tokensUsed = message.metadata?.tokensUsed;
          if (typeof tokensUsed === "number") {
            return (
              <span className="flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                {tokensUsed} tokens
              </span>
            );
          }
          return null;
        })()}
        {reasoning ? (
          <details className="group rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-open:text-foreground">
              <Lightbulb className="h-3 w-3" /> Reasoning
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground/90">
              {reasoning}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
