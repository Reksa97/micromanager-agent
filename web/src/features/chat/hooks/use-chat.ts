"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";

import type { ChatMessage } from "@/features/chat/types";

type ChatHistoryResponse = {
  messages?: Array<{
    id?: string;
    role: ChatMessage["role"];
    content: string;
    type?: ChatMessage["kind"];
    createdAt?: string;
    metadata?: Record<string, unknown>;
  }>;
};

interface UseChatOptions {
  onError?: (error: Error) => void;
}

const IDLE_POLL_INTERVAL_MS = 10_000;
const ACTIVE_POLL_INTERVAL_MS = 1_000;

export function useChat({ onError }: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const loadHistory = useCallback(
    async ({ showLoader = false }: { showLoader?: boolean } = {}) => {
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;

      if (showLoader) {
        setIsLoadingHistory(true);
      }

      try {
        if (process.env.NODE_ENV === "development") {
          console.debug("[chat] refreshing history", new Date().toISOString());
        }
        const response = await fetch("/api/chat", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load chat history");
        }

        const data = (await response.json()) as ChatHistoryResponse;
        setMessages(
          (data.messages ?? []).map((msg) => ({
            id: msg.id ?? nanoid(),
            role: msg.role,
            content: msg.content,
            kind: msg.type ?? "text",
            createdAt: msg.createdAt,
            streaming: Boolean((msg.metadata as { streaming?: boolean } | undefined)?.streaming),
            error: typeof (msg.metadata as { error?: string } | undefined)?.error === "string"
              ? (msg.metadata as { error?: string }).error
              : undefined,
          })),
        );
      } catch (error) {
        console.error(error);
        onErrorRef.current?.(error as Error);
      } finally {
        setIsLoadingHistory(false);
        isFetchingRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    loadHistory({ showLoader: true });
  }, [loadHistory]);

  useEffect(() => {
    const hasStreamingMessages = messages.some((msg) => msg.streaming);
    const pollInterval = isStreaming || hasStreamingMessages ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;

    const interval = setInterval(() => {
      loadHistory({ showLoader: false });
    }, pollInterval);

    return () => clearInterval(interval);
  }, [isStreaming, messages, loadHistory]);

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMessage: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: text,
        kind: "text",
      };

      const assistantMessage: ChatMessage = {
        id: nanoid(),
        role: "assistant",
        content: "Thinking…",
        kind: "text",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: text }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw new Error((errorBody as { error?: string } | null)?.error ?? "Failed to send message");
        }
      } catch (error) {
        console.error(error);
        const err = error as Error;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? {
                  ...msg,
                  streaming: false,
                  error: err.message,
                  content: msg.content || "Something went wrong.",
                }
              : msg,
          ),
        );
        onErrorRef.current?.(err);
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        void loadHistory({ showLoader: false });
      }
    },
    [isStreaming, loadHistory],
  );

  return {
    messages,
    isStreaming,
    isLoadingHistory,
    sendMessage,
    cancelStreaming,
  };
}
