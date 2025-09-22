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

const POLL_INTERVAL_MS = 10_000;

export function useChat({ onError }: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
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
            error:
              typeof (msg.metadata as { error?: string } | undefined)?.error ===
              "string"
                ? (msg.metadata as { error?: string }).error
                : undefined,
          }))
        );
      } catch (error) {
        console.error(error);
        onErrorRef.current?.(error as Error);
      } finally {
        setIsLoadingHistory(false);
        isFetchingRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    loadHistory({ showLoader: true });
  }, [loadHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadHistory({ showLoader: false });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadHistory]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      const timestamp = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: trimmed,
        kind: "text",
        createdAt: timestamp,
      };

      const assistantMessageId = nanoid();
      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "Thinking…",
        kind: "text",
        createdAt: timestamp,
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsSending(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: trimmed }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw new Error(
            (errorBody as { error?: string } | null)?.error ??
              "Failed to send message"
          );
        }

        const data = (await response.json().catch(() => null)) as {
          messageId?: string;
          content?: string;
        } | null;

        const finalContent = data?.content?.trim();
        const finalId = data?.messageId;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  id: finalId ?? msg.id,
                  content:
                    finalContent && finalContent.length > 0
                      ? finalContent
                      : "No response from assistant.",
                  createdAt: new Date().toISOString(),
                }
              : msg
          )
        );
      } catch (error) {
        console.error(error);
        const err = error as Error;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: msg.content ?? "Something went wrong.",
                  error: err.message,
                }
              : msg
          )
        );
        onErrorRef.current?.(err);
      } finally {
        setIsSending(false);
        void loadHistory({ showLoader: false });
      }
    },
    [isSending, loadHistory]
  );

  return {
    messages,
    isSending,
    isLoadingHistory,
    sendMessage,
  };
}
