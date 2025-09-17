import { tool as defineRealtimeTool } from "@openai/agents-core";

import { BASE_TOOL_DESCRIPTION, CONTEXT_TOOLSET_NAME, deleteSchema, readSchema, setSchema } from "./context-tools.shared";

interface RealtimeToolsetOptions {
  onResult?: (payload: {
    toolName: string;
    output: string;
    metadata?: Record<string, unknown>;
    args: unknown;
  }) => void;
  onError?: (error: Error) => void;
}

export function createRealtimeContextTools(options: RealtimeToolsetOptions = {}) {
  const makeFetcher = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/context", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(message || "Failed to run context tool");
    }

    const data = (await response.json()) as { output: string; metadata?: Record<string, unknown> };
    return data;
  };

  const wrap = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (error) {
      options.onError?.(error as Error);
      throw error;
    }
  };

  const readTool = defineRealtimeTool({
    name: "read_user_context",
    description: "Retrieve the latest snapshot of the user's private context document.",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: readSchema as any,
    async execute(args: { format?: string }) {
      return wrap(async () => {
        const result = await makeFetcher({ action: "get", format: args?.format ?? "json" });
        options.onResult?.({ toolName: "read_user_context", output: result.output, metadata: result.metadata, args });
        return result.output;
      });
    },
  });

  const setTool = defineRealtimeTool({
    name: "set_user_context_entry",
    description: "Create or update a field in the user's context document.",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: setSchema as any,
    async execute(args: { segments: string[]; value: unknown }) {
      return wrap(async () => {
        const result = await makeFetcher({ action: "set", segments: args.segments, value: args.value });
        options.onResult?.({
          toolName: "set_user_context_entry",
          output: result.output,
          metadata: result.metadata,
          args,
        });
        return result.output;
      });
    },
  });

  const deleteTool = defineRealtimeTool({
    name: "delete_user_context_entry",
    description: "Remove a field from the user's context document.",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: deleteSchema as any,
    async execute(args: { segments: string[] }) {
      return wrap(async () => {
        const result = await makeFetcher({ action: "delete", segments: args.segments });
        options.onResult?.({
          toolName: "delete_user_context_entry",
          output: result.output,
          metadata: result.metadata,
          args,
        });
        return result.output;
      });
    },
  });

  return {
    name: CONTEXT_TOOLSET_NAME,
    description: BASE_TOOL_DESCRIPTION,
    tools: [readTool, setTool, deleteTool],
  };
}

export function normalizeToolArguments(raw: string | undefined) {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON payload supplied by the model for tool invocation");
  }
}

export { CONTEXT_TOOLSET_NAME } from "./context-tools.shared";
