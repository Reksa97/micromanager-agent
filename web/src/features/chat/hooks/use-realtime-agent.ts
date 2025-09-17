"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";

import type { ChatMessage, VoiceSessionSignals } from "@/features/chat/types";

interface UseRealtimeAgentOptions {
  onMessages?: (messages: ChatMessage[]) => void;
  onStreamUpdate?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

const INITIAL_SIGNALS: VoiceSessionSignals = {
  state: "idle",
  lastUpdate: Date.now(),
};

type RealtimeEventPayload = {
  delta?: string;
  text?: string;
  transcript?: string;
  output_text?: string;
  error?: unknown;
};

export function useRealtimeAgent({ onMessages, onStreamUpdate, onError }: UseRealtimeAgentOptions = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const assistantStreamRef = useRef<ChatMessage | null>(null);
  const pendingForPersistence = useRef<ChatMessage[]>([]);

  const [signals, setSignals] = useState<VoiceSessionSignals>(INITIAL_SIGNALS);

  const reset = useCallback(() => {
    assistantStreamRef.current = null;
    pendingForPersistence.current = [];
    setSignals((prev) => ({ ...prev, state: "idle", agentSpeech: undefined, transcript: undefined }));
  }, []);

  const flushPending = useCallback(async () => {
    const payload = pendingForPersistence.current;
    pendingForPersistence.current = [];
    if (!payload.length) return;

    try {
      await fetch("/api/conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: payload.map(({ role, content, kind, createdAt }) => ({
          role,
          content,
          type: kind,
          createdAt,
        })) }),
      });
    } catch (error) {
      console.error("Failed to persist realtime messages", error);
    }
  }, []);

  const handleAssistantDelta = useCallback(
    (delta: string) => {
      if (!assistantStreamRef.current) {
        assistantStreamRef.current = {
          id: nanoid(),
          role: "assistant",
          content: delta,
          kind: "audio",
          streaming: true,
          createdAt: new Date().toISOString(),
        };
        onStreamUpdate?.(assistantStreamRef.current);
      } else {
        assistantStreamRef.current = {
          ...assistantStreamRef.current,
          content: `${assistantStreamRef.current.content}${delta}`,
        };
        onStreamUpdate?.(assistantStreamRef.current);
      }

      setSignals((prev) => ({
        ...prev,
        state: "speaking",
        lastUpdate: Date.now(),
        agentSpeech: assistantStreamRef.current.content,
      }));
    },
    [onStreamUpdate],
  );

  const finalizeAssistantMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const finalized: ChatMessage = {
        id: assistantStreamRef.current?.id ?? nanoid(),
        role: "assistant",
        content: text.trim(),
        kind: "audio",
        createdAt: new Date().toISOString(),
      };
      assistantStreamRef.current = null;
      onMessages?.([finalized]);
      pendingForPersistence.current.push({ ...finalized, kind: "text" });
      setSignals((prev) => ({
        ...prev,
        state: "listening",
        lastUpdate: Date.now(),
        agentSpeech: undefined,
      }));
    },
    [onMessages],
  );

  const startSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;

    setSignals({ state: "connecting", lastUpdate: Date.now() });

    try {
      const response = await fetch("/api/realtime/session", { method: "POST" });
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
        instructions:
          "You are a realtime operator. Keep a running mental model of the meeting, confirm understanding, and outline action items.",
      });
      agentRef.current = agent;

      const session = new RealtimeSession(agent, { transport: "webrtc" });
      sessionRef.current = session;

      session.on("connected", () => {
        setSignals({ state: "listening", lastUpdate: Date.now() });
      });

      session.on("error", (payload: unknown) => {
        const base = (payload as RealtimeEventPayload)?.error ?? payload;
        const err = base instanceof Error ? base : new Error(String(base ?? "Unknown realtime error"));
        console.error("Realtime session error", err);
        setSignals({ state: "error", lastUpdate: Date.now(), error: err.message });
        onError?.(err);
      });

      session.on("disconnected", async () => {
        setSignals((prev) => ({ ...prev, state: "ended", lastUpdate: Date.now() }));
        await flushPending();
        reset();
        sessionRef.current = null;
        agentRef.current = null;
      });

      session.on("input_audio_buffer.speech_started", () => {
        setSignals((prev) => ({ ...prev, state: "listening", lastUpdate: Date.now() }));
      });

      session.on("input_audio_buffer.speech_stopped", () => {
        setSignals((prev) => ({ ...prev, state: "processing", lastUpdate: Date.now() }));
      });

      session.on("conversation.item.audio_transcription.completed", (event: RealtimeEventPayload) => {
        const transcript = event.transcript ?? event.text;
        if (!transcript) return;
        const message: ChatMessage = {
          id: nanoid(),
          role: "user",
          content: transcript,
          kind: "audio",
          createdAt: new Date().toISOString(),
        };
        onMessages?.([message]);
        pendingForPersistence.current.push({ ...message, kind: "text" });
        setSignals((prev) => ({
          ...prev,
          transcript,
          lastUpdate: Date.now(),
        }));
      });

      const handleDelta = (event: RealtimeEventPayload) => {
        const delta = event.delta ?? event.text;
        if (!delta) return;
        handleAssistantDelta(delta);
      };

      const handleDone = async (event: RealtimeEventPayload) => {
        const text =
          event.transcript ??
          event.text ??
          event.output_text ??
          assistantStreamRef.current?.content ??
          "";
        finalizeAssistantMessage(text);
        await flushPending();
      };

      session.on("response.audio_transcript.delta", handleDelta);
      session.on("response.text.delta", handleDelta);

      session.on("response.audio_transcript.done", handleDone);
      session.on("response.text.done", handleDone);

      session.on("response.created", () => {
        setSignals((prev) => ({ ...prev, state: "processing", lastUpdate: Date.now() }));
      });

      session.on("response.done", async () => {
        await flushPending();
      });

      await session.connect({ apiKey: secret });

      return session;
    } catch (error) {
      console.error(error);
      const err = error as Error;
      onError?.(err);
      setSignals({ state: "error", lastUpdate: Date.now(), error: err.message });
      sessionRef.current = null;
      agentRef.current = null;
      throw err;
    }
  }, [finalizeAssistantMessage, flushPending, handleAssistantDelta, onError, onMessages, reset]);

  const stopSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      await flushPending();
      session.disconnect();
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
      stopSession();
    };
  }, [stopSession]);

  return {
    voiceSignals: signals,
    isVoiceActive: ["connecting", "listening", "processing", "speaking", "executing"].includes(
      signals.state,
    ),
    startSession,
    stopSession,
  };
}
