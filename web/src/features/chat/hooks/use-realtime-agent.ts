/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  RealtimeAgent,
  RealtimeSession,
  utils,
  type RealtimeTransportEventTypes,
  type TransportEvent,
  type TransportLayerResponseCompleted,
  type TransportLayerTranscriptDelta,
} from "@openai/agents-realtime";

import type { ChatMessage, VoiceSessionSignals } from "@/features/chat/types";
import { createRealtimeContextTools } from "@/lib/agent/context-tools";

interface UseRealtimeAgentOptions {
  onMessages?: (messages: ChatMessage[]) => void;
  onError?: (error: Error) => void;
  authToken?: string | null;
  getAuthToken?: () => string | null;
}

const INITIAL_SIGNALS: VoiceSessionSignals = {
  state: "idle",
  lastUpdate: Date.now(),
};

const BASE_REALTIME_INSTRUCTIONS =
  "You are a realtime operator. Keep a running mental model of the meeting, confirm understanding, and outline action items.";

type TransportConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "disconnecting";
type TranscriptCompletedEvent = TransportEvent & {
  type: "conversation.item.input_audio_transcription.completed";
  transcript?: string;
  item_id: string;
};

type RealtimeSessionErrorPayload = {
  type: "error";
  error: unknown;
};

export function useRealtimeAgent({
  onMessages,
  onError,
  authToken,
  getAuthToken,
}: UseRealtimeAgentOptions = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const assistantStreamRef = useRef<ChatMessage | null>(null);
  const pendingForPersistence = useRef<
    Array<ChatMessage & { metadata?: Record<string, unknown> }>
  >([]);
  const listenerCleanupRef = useRef<(() => void)[]>([]);
  const authTokenGetterRef = useRef<() => string | null>(
    () => authToken ?? null
  );

  const [signals, setSignals] = useState<VoiceSessionSignals>(INITIAL_SIGNALS);

  useEffect(() => {
    authTokenGetterRef.current = () => {
      if (typeof getAuthToken === "function") {
        try {
          return getAuthToken() ?? null;
        } catch (error) {
          console.error(
            "Failed to resolve auth token for realtime agent",
            error
          );
          return null;
        }
      }
      return authToken ?? null;
    };
  }, [authToken, getAuthToken]);

  const withAuth = useCallback((init: RequestInit = {}) => {
    const token = authTokenGetterRef.current();
    if (!token) return init;
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    return {
      ...init,
      headers,
    } satisfies RequestInit;
  }, []);

  const registerCleanup = useCallback((cleanup: () => void) => {
    listenerCleanupRef.current.push(cleanup);
  }, []);

  const clearRegisteredListeners = useCallback(() => {
    const callbacks = listenerCleanupRef.current;
    listenerCleanupRef.current = [];
    callbacks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.error("Failed to cleanup realtime listener", error);
      }
    });
  }, []);

  const reset = useCallback(() => {
    clearRegisteredListeners();
    assistantStreamRef.current = null;
    pendingForPersistence.current = [];
    setSignals((prev) => ({
      ...prev,
      state: "idle",
      lastUpdate: Date.now(),
      agentSpeech: undefined,
    }));
  }, [clearRegisteredListeners]);

  const flushPending = useCallback(async () => {
    const payload = pendingForPersistence.current;
    pendingForPersistence.current = [];
    if (!payload.length) return;

    try {
      await fetch(
        "/api/conversation",
        withAuth({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: payload.map(
              ({ role, content, kind, createdAt, metadata }) => ({
                role,
                content,
                type: kind,
                createdAt,
                metadata,
              })
            ),
          }),
        })
      );
    } catch (error) {
      console.error("Failed to persist realtime messages", error);
    }
  }, [withAuth]);

  const handleAssistantDelta = useCallback((delta: string) => {
    const timestamp = new Date().toISOString();
    const existing = assistantStreamRef.current;
    const updated: ChatMessage = existing
      ? {
          ...existing,
          content: `${existing.content}${delta}`,
          streaming: true,
        }
      : {
          id: nanoid(),
          role: "assistant",
          content: delta,
          kind: "audio",
          streaming: true,
          createdAt: timestamp,
        };

    assistantStreamRef.current = updated;

    setSignals((prev) => ({
      ...prev,
      state: "speaking",
      lastUpdate: Date.now(),
      agentSpeech: updated.content,
      assistantResponse: undefined,
    }));
  }, []);

  const finalizeAssistantMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        assistantStreamRef.current = null;
        setSignals((prev) => ({
          ...prev,
          state: "listening",
          lastUpdate: Date.now(),
          agentSpeech: undefined,
        }));
        return;
      }

      const ref = assistantStreamRef.current;
      const finalized: ChatMessage = {
        id: ref?.id ?? nanoid(),
        role: "assistant",
        content: trimmed,
        kind: "audio",
        createdAt: ref?.createdAt ?? new Date().toISOString(),
      };

      assistantStreamRef.current = null;
      onMessages?.([finalized]);
      pendingForPersistence.current.push({ ...finalized, kind: "text" });
      setSignals((prev) => ({
        ...prev,
        state: "listening",
        lastUpdate: Date.now(),
        agentSpeech: undefined,
        assistantResponse: trimmed,
      }));
    },
    [onMessages]
  );

  const handleUserTranscript = useCallback(
    (transcript: string) => {
      const trimmed = transcript.trim();
      if (!trimmed) return;

      const message: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: trimmed,
        kind: "audio",
        createdAt: new Date().toISOString(),
      };

      onMessages?.([message]);
      pendingForPersistence.current.push({ ...message, kind: "text" });
      setSignals((prev) => ({
        ...prev,
        transcript: trimmed,
        lastUpdate: Date.now(),
      }));
    },
    [onMessages]
  );

  const startSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;

    setSignals((prev) => ({
      ...prev,
      state: "connecting",
      lastUpdate: Date.now(),
      agentSpeech: undefined,
      error: undefined,
    }));

    try {
      let contextSnapshot = "The user context is currently empty.";

      try {
        const contextResponse = await fetch(
          "/api/context",
          withAuth({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "get", format: "text" }),
          })
        );

        if (contextResponse.ok) {
          const contextJson = await contextResponse.json();
          const candidate =
            typeof contextJson?.output === "string"
              ? contextJson.output.trim()
              : "";
          contextSnapshot =
            candidate.length > 0
              ? candidate
              : "The user context is currently empty.";
        } else {
          contextSnapshot = "User context could not be retrieved at this time.";
        }
      } catch (contextError) {
        console.error(
          "Failed to fetch user context for realtime session",
          contextError
        );
        contextSnapshot = "User context could not be retrieved at this time.";
      }

      const contextTools = createRealtimeContextTools({
        onResult: ({ toolName, output, metadata, args }) => {
          pendingForPersistence.current.push({
            id: nanoid(),
            role: "tool",
            content: output,
            kind: "tool",
            createdAt: new Date().toISOString(),
            metadata: {
              toolName,
              arguments: args,
              ...(metadata ?? {}),
            },
          });
          setSignals((prev) => ({
            ...prev,
            actionSummary: `Tool ${toolName} completed`,
            lastUpdate: Date.now(),
          }));
          void flushPending();
        },
        onError: (toolError) => {
          console.error("Realtime context tool error", toolError);
          setSignals((prev) => ({
            ...prev,
            error: toolError.message,
            lastUpdate: Date.now(),
          }));
          onError?.(toolError);
        },
        getAuthToken: () => authTokenGetterRef.current(),
      });

      const response = await fetch(
        "/api/realtime/session",
        withAuth({ method: "POST" })
      );
      if (!response.ok) {
        throw new Error("Failed to initialize realtime session");
      }

      const data = await response.json();
      const secret = data?.client_secret?.value ?? data?.value;
      if (!secret) {
        throw new Error("Realtime token missing from response");
      }

      const agent = new RealtimeAgent({
        name: "Micromanager",
        instructions: `${BASE_REALTIME_INSTRUCTIONS}\n\nCurrent user context snapshot:\n${contextSnapshot}`,
        tools: contextTools.tools,
      });

      agentRef.current = agent;

      const session = new RealtimeSession(agent, { transport: "webrtc" });
      sessionRef.current = session;

      clearRegisteredListeners();

      const transport = session.transport;

      const registerTransport = <K extends keyof RealtimeTransportEventTypes>(
        event: K,
        handler: (...args: RealtimeTransportEventTypes[K]) => void
      ) => {
        transport.on(event, handler);
        registerCleanup(() => transport.off(event, handler));
      };

      registerTransport(
        "connection_change",
        (status: TransportConnectionState) => {
          setSignals((prev) => ({
            ...prev,
            state:
              status === "connected"
                ? "listening"
                : status === "connecting"
                ? "connecting"
                : "ended",
            lastUpdate: Date.now(),
            agentSpeech:
              status === "disconnected" || status === "disconnecting"
                ? undefined
                : prev.agentSpeech,
            error: status === "connected" ? undefined : prev.error,
          }));

          if (status === "disconnected" || status === "disconnecting") {
            void flushPending();
            sessionRef.current = null;
            agentRef.current = null;
            reset();
          }
        }
      );

      registerTransport("turn_started", () => {
        setSignals((prev) => ({
          ...prev,
          state: "processing",
          lastUpdate: Date.now(),
          assistantResponse: prev.assistantResponse,
        }));
      });

      registerTransport(
        "audio_transcript_delta",
        (event: TransportLayerTranscriptDelta) => {
          handleAssistantDelta(event.delta);
        }
      );

      registerTransport(
        "turn_done",
        (event: TransportLayerResponseCompleted) => {
          const outputItems = event.response.output ?? [];
          const lastItem = outputItems[outputItems.length - 1];
          const fromItem = lastItem
            ? utils.getLastTextFromAudioOutputMessage(lastItem)
            : null;
          const fallback = assistantStreamRef.current?.content ?? "";
          finalizeAssistantMessage(fromItem ?? fallback);
          void flushPending();
        }
      );

      registerTransport("audio_done", () => {
        setSignals((prev) => ({
          ...prev,
          state: "listening",
          lastUpdate: Date.now(),
          agentSpeech: undefined,
        }));
      });

      registerTransport("audio_interrupted", () => {
        assistantStreamRef.current = null;
        setSignals((prev) => ({
          ...prev,
          state: "listening",
          lastUpdate: Date.now(),
          agentSpeech: undefined,
        }));
      });

      registerTransport("function_call", (event) => {
        let prettyArgs = event.arguments;
        try {
          const parsed = JSON.parse(event.arguments ?? "{}");
          prettyArgs = JSON.stringify(parsed, null, 2);
        } catch {
          // fall back to raw string
        }
        const trimmed = (prettyArgs ?? "").trim();
        const preview =
          trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
        setSignals((prev) => ({
          ...prev,
          actionSummary: `Tool ${event.name} invoked${
            preview ? `\n${preview}` : ""
          }`,
          lastUpdate: Date.now(),
        }));
      });

      registerTransport("error", (transportError) => {
        const raw = transportError.error;
        const err =
          raw instanceof Error
            ? raw
            : new Error(String(raw ?? "Realtime transport error"));
        console.error("Realtime transport error", err);
        setSignals((prev) => ({
          ...prev,
          state: "error",
          lastUpdate: Date.now(),
          error: err.message,
        }));
        onError?.(err);
      });

      registerTransport("*", (event: TransportEvent) => {
        if (
          event.type === "conversation.item.input_audio_transcription.completed"
        ) {
          const completed = event as TranscriptCompletedEvent;
          const transcript = completed.transcript ?? "";
          if (!transcript) return;
          handleUserTranscript(transcript);
        }
      });

      const handleSessionError = (payload: RealtimeSessionErrorPayload) => {
        const base = payload.error;
        const err =
          base instanceof Error
            ? base
            : new Error(String(base ?? "Unknown realtime error"));
        console.error("Realtime session error", err);
        setSignals((prev) => ({
          ...prev,
          state: "error",
          lastUpdate: Date.now(),
          error: err.message,
        }));
        onError?.(err);
      };

      session.on("error", handleSessionError);
      registerCleanup(() => session.off("error", handleSessionError));

      const handleAudioStart = () => {
        setSignals((prev) => ({
          ...prev,
          state: "speaking",
          lastUpdate: Date.now(),
        }));
      };
      session.on("audio_start", handleAudioStart);
      registerCleanup(() => session.off("audio_start", handleAudioStart));

      const handleAudioStopped = () => {
        setSignals((prev) => ({
          ...prev,
          state: "listening",
          lastUpdate: Date.now(),
          agentSpeech: undefined,
        }));
      };
      session.on("audio_stopped", handleAudioStopped);
      registerCleanup(() => session.off("audio_stopped", handleAudioStopped));

      await session.connect({ apiKey: secret });

      return session;
    } catch (error) {
      console.error(error);
      const err = error as Error;
      onError?.(err);
      setSignals((prev) => ({
        ...prev,
        state: "error",
        lastUpdate: Date.now(),
        error: err.message,
      }));
      sessionRef.current = null;
      agentRef.current = null;
      clearRegisteredListeners();
      throw err;
    }
  }, [
    clearRegisteredListeners,
    finalizeAssistantMessage,
    flushPending,
    handleAssistantDelta,
    handleUserTranscript,
    registerCleanup,
    onError,
    reset,
  ]);

  const stopSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      await flushPending();
      session.close();
    } catch (error) {
      console.error("Failed to stop realtime session", error);
    } finally {
      sessionRef.current = null;
      agentRef.current = null;
      reset();
    }
  }, [flushPending, reset]);

  useEffect(() => {
    return () => {
      void stopSession();
    };
  }, [stopSession]);

  return {
    voiceSignals: signals,
    isVoiceActive: [
      "connecting",
      "listening",
      "processing",
      "speaking",
      "executing",
    ].includes(signals.state),
    startSession,
    stopSession,
  };
}
