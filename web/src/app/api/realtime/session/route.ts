import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { env } from "@/env";
import { MODELS } from "@/lib/openai";
import { jwtVerify } from "jose";

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
      console.error(
        "[Realtime Session API] Failed to verify Telegram token",
        error
      );
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 600,
        },
        session: {
          type: "realtime",
          model: MODELS.realtime,
          instructions:
            "You are Micromanager, a fast realtime copilot. Keep track of commitments, surface blockers, and confirm next steps aloud.",
        },
      }),
    }
  );

  if (!upstream.ok) {
    const errorText = await upstream.text();
    console.error(
      "Failed to create realtime session",
      upstream.status,
      errorText
    );
    return NextResponse.json(
      { error: "Failed to create realtime session" },
      { status: 500 }
    );
  }

  const data = await upstream.json();
  return NextResponse.json(data);
}
