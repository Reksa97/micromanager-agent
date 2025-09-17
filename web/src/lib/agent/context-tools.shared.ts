export type JsonSchemaDefinitionEntry = Record<string, unknown>;

export type JsonObjectSchema<Properties extends Record<string, JsonSchemaDefinitionEntry>> = {
  type: "object";
  description?: string;
  properties: Properties;
  required: Array<keyof Properties>;
  additionalProperties: boolean;
};

export const CONTEXT_TOOLSET_NAME = "micromanager_user_context";

export const BASE_TOOL_DESCRIPTION =
  "Tools for reading and updating the authenticated user's private context document. Use these to recall prior commitments, owners, deadlines, and notes before answering.";

export type ReadSchemaProps = {
  format: JsonSchemaDefinitionEntry;
};

export type SetSchemaProps = {
  segments: JsonSchemaDefinitionEntry;
  value: JsonSchemaDefinitionEntry;
};

export type DeleteSchemaProps = {
  segments: JsonSchemaDefinitionEntry;
};

export const segmentsSchema: JsonSchemaDefinitionEntry = {
  type: "array",
  description: "Ordered path segments that identify where in the context document to operate.",
  items: {
    type: "string",
    minLength: 1,
    description: "A single segment of the path (object key or numeric array index).",
  },
  minItems: 1,
} as const;

export const readSchema: JsonObjectSchema<ReadSchemaProps> = {
  type: "object",
  description: "Read the entire user context document in either JSON or summary form.",
  properties: {
    format: {
      type: "string",
      enum: ["json", "text"],
      description: "If 'text', return a human-friendly summary. Defaults to 'json'.",
    },
  },
  required: [] as Array<keyof ReadSchemaProps>,
  additionalProperties: false,
};

export const setSchema: JsonObjectSchema<SetSchemaProps> = {
  type: "object",
  description: "Set or replace a value at the provided path in the user context document.",
  properties: {
    segments: segmentsSchema,
    value: {
      description: "The JSON value to store at the target path.",
      oneOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "object", additionalProperties: true },
        { type: "array", items: {} },
        { type: "null" },
      ],
    },
  },
  required: ["segments", "value"] as Array<keyof SetSchemaProps>,
  additionalProperties: false,
};

export const deleteSchema: JsonObjectSchema<DeleteSchemaProps> = {
  type: "object",
  description: "Remove a value from the user context document at the provided path.",
  properties: {
    segments: segmentsSchema,
  },
  required: ["segments"] as Array<keyof DeleteSchemaProps>,
  additionalProperties: false,
};

export interface ToolInvocationResult {
  output: string;
  metadata?: Record<string, unknown>;
}

export type ToolInvocationHandler = (args: unknown) => Promise<ToolInvocationResult>;
