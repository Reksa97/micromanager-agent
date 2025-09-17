import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  insertMessage,
  getRecentMessages,
  updateMessage,
  type StoredMessage,
} from "@/lib/conversations";
import { notifyTelegramUser } from "@/lib/telegram/bot";
import { MODELS, openai } from "@/lib/openai";
import { normalizeToolArguments } from "@/lib/agent/context-tools";
import { createServerContextToolset, type ToolInvocationResult } from "@/lib/agent/context-tools.server";
import { formatContextForPrompt, getUserContextDocument } from "@/lib/user-context";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

const requestSchema = z.object({
  message: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
});

const STREAM_UPDATE_INTERVAL_MS = 1_000;
const MAX_TOOL_ITERATIONS = 4;

interface AggregatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

type StreamResult =
  | {
      kind: "assistant";
      text: string;
      finishReason?: string;
    }
  | {
      kind: "tool_calls";
      text: string;
      toolCalls: AggregatedToolCall[];
    };

function toChatMessages(history: StoredMessage[]): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  for (const entry of history) {
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;

    if (entry.role === "tool") {
      const toolCallId = typeof metadata.toolCallId === "string" ? metadata.toolCallId : undefined;
      if (!toolCallId) continue;
      messages.push({
        role: "tool",
        content: entry.content,
        tool_call_id: toolCallId,
      });
      continue;
    }

    if (entry.role === "assistant" && Array.isArray(metadata.toolCalls)) {
      const toolCalls = (metadata.toolCalls as unknown[]).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const tc = item as { id?: unknown; name?: unknown; arguments?: unknown };
        if (typeof tc.id !== "string" || typeof tc.name !== "string" || typeof tc.arguments !== "string") {
          return [];
        }
        return [
          {
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          },
        ];
      });

      messages.push({
        role: "assistant",
        content: entry.content ?? "",
        tool_calls: toolCalls,
      });
      continue;
    }

    if (entry.role === "assistant" || entry.role === "user" || entry.role === "system") {
      messages.push({
        role: entry.role,
        content: entry.content,
      });
    }
  }

  return messages;
}

async function streamChatCompletion({
  messages,
  tools,
  temperature,
  assistantMessageId,
}: {
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  temperature: number;
  assistantMessageId: string;
}): Promise<StreamResult> {
  const stream = await openai.chat.completions.create({
    model: MODELS.text,
    temperature,
    messages,
    stream: true,
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
  });

  const toolCalls = new Map<number, AggregatedToolCall>();
  let assistantFullText = "";
  let finishReason: string | undefined;
  let lastFlush = Date.now();

  const flushUpdate = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlush < STREAM_UPDATE_INTERVAL_MS) {
      return;
    }
    lastFlush = now;
    await updateMessage(assistantMessageId, {
      content: assistantFullText,
      metadata: { streaming: true },
    });
  };

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;
    const delta = choice.delta;

    if (delta?.content) {
      assistantFullText += delta.content;
      await flushUpdate();
    }

    if (Array.isArray(delta?.tool_calls)) {
      for (const toolCallDelta of delta.tool_calls) {
        const index = toolCallDelta.index ?? 0;
        const existing = toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
        if (toolCallDelta.id) {
          existing.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          existing.name = toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          existing.arguments += toolCallDelta.function.arguments;
        }
        toolCalls.set(index, existing);
      }
    }

    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
  }

  await flushUpdate(true);

  if (finishReason === "tool_calls") {
    const aggregated = Array.from(toolCalls.values()).map((call) => {
      if (!call.id || !call.name) {
        throw new Error("Incomplete tool call information received from model");
      }
      return call;
    });

    return {
      kind: "tool_calls",
      text: assistantFullText,
      toolCalls: aggregated,
    };
  }

  return {
    kind: "assistant",
    text: assistantFullText,
    finishReason,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parseResult = requestSchema.safeParse(json);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parseResult.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { message, temperature = 0.7 } = parseResult.data;
  const userId = session.user.id;

  let activeAssistantMessageId: string | null = null;

  try {
    const [history, contextDoc] = await Promise.all([
      getRecentMessages(userId, 40),
      getUserContextDocument(userId),
    ]);

    const contextPrompt = formatContextForPrompt(contextDoc);
    const serverToolset = createServerContextToolset(userId);
    const historyMessages = toChatMessages(history);

    const conversation: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are Micromanager, an operations-focused AI agent. Reference the user's saved context before answering, keep responses concise and actionable, and outline next steps when applicable.",
      },
      {
        role: "system",
        content: contextPrompt,
      },
      ...historyMessages,
      { role: "user", content: message },
    ];

    const now = new Date();
    await insertMessage({
      userId,
      role: "user",
      content: message,
      type: "text",
      source: "web-user",
      createdAt: now,
      updatedAt: now,
    });

    // Try to notify Telegram user about the new message
    notifyTelegramUser(userId, `💬 New message from web:\n\n${message}`).catch((error) => {
      console.error("Failed to send Telegram notification:", error);
    });

    const assistantPlaceholderId = await insertMessage({
      userId,
      role: "assistant",
      content: "",
      type: "text",
      source: "micromanager",
      createdAt: now,
      updatedAt: now,
      metadata: { streaming: true },
    });

    activeAssistantMessageId = assistantPlaceholderId;

    let messagesForModel = conversation;
    let currentAssistantId = assistantPlaceholderId;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const result = await streamChatCompletion({
        messages: messagesForModel,
        tools: serverToolset.tools,
        temperature,
        assistantMessageId: currentAssistantId,
      });

      if (result.kind === "assistant") {
        const finalContent = result.text.trim();
        await updateMessage(currentAssistantId, {
          content: finalContent,
          metadata: { streaming: false },
          type: "text",
        });

        // Try to notify Telegram user about the assistant response
        notifyTelegramUser(userId, `🤖 Assistant response:\n\n${finalContent}`).catch((error) => {
          console.error("Failed to send Telegram notification:", error);
        });

        return NextResponse.json({ messageId: currentAssistantId, content: finalContent });
      }

      // Tool calls branch
      const assistantSummary = result.text.trim();
      await updateMessage(currentAssistantId, {
        content: assistantSummary,
        metadata: {
          streaming: false,
          toolCalls: result.toolCalls,
        },
        type: "state",
      });

      const assistantToolMessage: ChatCompletionMessageParam = {
        role: "assistant",
        content: assistantSummary,
        tool_calls: result.toolCalls.map<ChatCompletionMessageToolCall>((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: call.arguments,
          },
        })),
      };

      messagesForModel = [...messagesForModel, assistantToolMessage];

      for (const call of result.toolCalls) {
        let handlerResult: ToolInvocationResult | null = null;
        let parsedArgs: unknown;
        let toolError: Error | null = null;

        try {
          parsedArgs = normalizeToolArguments(call.arguments);
          const handler = serverToolset.handlers.get(call.name);
          if (!handler) {
            throw new Error(`Tool ${call.name} is not available.`);
          }
          handlerResult = await handler(parsedArgs);
        } catch (error) {
          toolError = error instanceof Error ? error : new Error(String(error));
        }

        const toolContent = toolError
          ? `Unable to execute ${call.name}: ${toolError.message}`
          : handlerResult?.output ?? `Tool ${call.name} completed.`;

        messagesForModel = [
          ...messagesForModel,
          {
            role: "tool",
            content: toolContent,
            tool_call_id: call.id,
          },
        ];

        await insertMessage({
          userId,
          role: "tool",
          content: toolContent,
          type: "tool",
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            toolCallId: call.id,
            toolName: call.name,
            arguments: parsedArgs,
            ...(handlerResult?.metadata ?? {}),
            ...(toolError
              ? {
                  error: toolError.message,
                }
              : {}),
          },
        });
      }

      // Prepare new assistant placeholder for the follow-up response
      const nextAssistantId = await insertMessage({
        userId,
        role: "assistant",
        content: "",
        type: "text",
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { streaming: true },
      });

      currentAssistantId = nextAssistantId;
      activeAssistantMessageId = nextAssistantId;
    }

    const fallbackMessage = "Tool loop limit reached before producing a final response.";
    if (activeAssistantMessageId) {
      await updateMessage(activeAssistantMessageId, {
        content: fallbackMessage,
        metadata: { streaming: false, error: fallbackMessage },
        type: "text",
      });
    }

    return NextResponse.json({ error: fallbackMessage }, { status: 500 });
  } catch (error) {
    console.error("Failed to generate assistant response", error);
    const err = error instanceof Error ? error : new Error(String(error));

    if (activeAssistantMessageId) {
      await updateMessage(activeAssistantMessageId, {
        content: err.message,
        metadata: { streaming: false, error: err.message },
      });
    }

    return NextResponse.json({ error: "Unable to generate response" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await getRecentMessages(session.user.id, 100);
  return NextResponse.json({ messages });
}
