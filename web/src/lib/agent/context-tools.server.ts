import type { ChatCompletionTool } from "openai/resources/chat/completions";

import {
  BASE_TOOL_DESCRIPTION,
  CONTEXT_TOOLSET_NAME,
  deleteSchema,
  readSchema,
  setSchema,
  type ToolInvocationHandler,
  type ToolInvocationResult,
} from "./context-tools.shared";
import {
  deleteUserContextValue,
  formatContextForPrompt,
  getUserContextDocument,
  setUserContextValue,
} from "@/lib/user-context";

interface ServerToolset {
  name: string;
  description: string;
  tools: ChatCompletionTool[];
  handlers: Map<string, ToolInvocationHandler>;
}

export function createServerContextToolset(userId: string): ServerToolset {
  const handlers = new Map<string, ToolInvocationHandler>();

  handlers.set("read_user_context", async (rawArgs) => {
    const args = (rawArgs ?? {}) as { format?: string };
    const doc = await getUserContextDocument(userId);
    const formatted = formatContextForPrompt(doc);
    return {
      output: args.format === "text" ? formatted : JSON.stringify(doc.data, null, 2),
      metadata: {
        updatedAt: doc.updatedAt.toISOString(),
      },
    } satisfies ToolInvocationResult;
  });

  handlers.set("set_user_context_entry", async (rawArgs) => {
    const args = rawArgs as { segments?: string[]; value?: unknown };
    if (!Array.isArray(args?.segments) || args.segments.length === 0) {
      throw new Error("segments must be a non-empty array of strings");
    }
    if (!Object.prototype.hasOwnProperty.call(args, "value")) {
      throw new Error("value must be provided when setting context data");
    }
    const { path, updatedAt } = await setUserContextValue(userId, args.segments, args.value);
    const renderedValue = JSON.stringify(args.value, null, 2);
    return {
      output: `Stored value at path "${path}":\n${renderedValue}`,
      metadata: {
        operation: "set",
        path,
        value: args.value,
        updatedAt: updatedAt.toISOString(),
      },
    } satisfies ToolInvocationResult;
  });

  handlers.set("delete_user_context_entry", async (rawArgs) => {
    const args = rawArgs as { segments?: string[] };
    if (!Array.isArray(args?.segments) || args.segments.length === 0) {
      throw new Error("segments must be a non-empty array of strings");
    }
    const { path, updatedAt } = await deleteUserContextValue(userId, args.segments);
    return {
      output: `Removed value at path "${path}".`,
      metadata: {
        operation: "delete",
        path,
        updatedAt: updatedAt.toISOString(),
      },
    } satisfies ToolInvocationResult;
  });

  const tools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "read_user_context",
        description: "Retrieve the latest snapshot of the user's private context document.",
        parameters: readSchema,
      },
    },
    {
      type: "function",
      function: {
        name: "set_user_context_entry",
        description: "Create or update a field in the user's context document.",
        parameters: setSchema,
      },
    },
    {
      type: "function",
      function: {
        name: "delete_user_context_entry",
        description: "Remove a field from the user's context document.",
        parameters: deleteSchema,
      },
    },
  ];

  return {
    name: CONTEXT_TOOLSET_NAME,
    description: BASE_TOOL_DESCRIPTION,
    tools,
    handlers,
  };
}

export type { ToolInvocationHandler, ToolInvocationResult };
