import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { getUserContextDocument } from "@/lib/user-context";
import { jwtVerify } from "jose";
import { env } from "@/env";

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

const requestSchema = z.discriminatedUnion("action", [
  getSchema,
  setSchema,
  deleteSchema,
]);

export async function POST(request: NextRequest) {
  const session = await auth();
  let userId = session?.user?.id;

  if (!userId) {
    try {
      let token = request.cookies.get("telegram-auth-token")?.value;
      const authHeader = request.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      if (token) {
        const { payload } = await jwtVerify(token, env.JWT_SECRET);
        userId = typeof payload.sub === "string" ? payload.sub : undefined;
      }
    } catch (error) {
      console.error("[Context API] Failed to verify Telegram token", error);
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parseResult = requestSchema.safeParse(json);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const payload = parseResult.data;

  switch (payload.action) {
    case "get": {
      const doc = await getUserContextDocument(userId);
      return NextResponse.json({
        output: JSON.stringify(doc.data, null, 2),
        metadata: {
          updatedAt: doc.updatedAt.toISOString(),
          format: payload.format ?? "json",
        },
      });
    }
    case "set": {
      console.error("Not implemented");
      return NextResponse.json({ error: "Not implemented" }, { status: 501 });
    }
    default:
      return NextResponse.json(
        { error: "Unsupported action" },
        { status: 400 }
      );
  }
}
