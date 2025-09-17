import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  deleteUserContextValue,
  formatContextForPrompt,
  getUserContextDocument,
  setUserContextValue,
} from "@/lib/user-context";

const getSchema = z.object({
  action: z.literal("get"),
  format: z.enum(["json", "text"]).optional(),
});

const setSchema = z.object({
  action: z.literal("set"),
  segments: z.array(z.string().min(1)).min(1),
  value: z.unknown(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  segments: z.array(z.string().min(1)).min(1),
});

const requestSchema = z.discriminatedUnion("action", [getSchema, setSchema, deleteSchema]);

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

  const userId = session.user.id;
  const payload = parseResult.data;

  switch (payload.action) {
    case "get": {
      const doc = await getUserContextDocument(userId);
      const output = payload.format === "text" ? formatContextForPrompt(doc) : JSON.stringify(doc.data, null, 2);
      return NextResponse.json({
        output,
        metadata: {
          updatedAt: doc.updatedAt.toISOString(),
          format: payload.format ?? "json",
        },
      });
    }
    case "set": {
      const { path, updatedAt } = await setUserContextValue(userId, payload.segments, payload.value);
      const renderedValue = JSON.stringify(payload.value, null, 2);
      return NextResponse.json({
        output: `Stored value at path "${path}":\n${renderedValue}`,
        metadata: {
          operation: "set",
          path,
          updatedAt: updatedAt.toISOString(),
        },
      });
    }
    case "delete": {
      const { path, updatedAt } = await deleteUserContextValue(userId, payload.segments);
      return NextResponse.json({
        output: `Removed value at path "${path}".`,
        metadata: {
          operation: "delete",
          path,
          updatedAt: updatedAt.toISOString(),
        },
      });
    }
    default:
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
}

