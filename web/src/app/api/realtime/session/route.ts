import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { env } from "@/env";
import { MODELS } from "@/lib/openai";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "realtime=v1",
    },
    body: JSON.stringify({
      expires_in: 600,
      session: {
        type: "realtime",
        model: MODELS.realtime,
        voice: "verse",
        instructions:
          "You are Micromanager, a fast realtime copilot. Keep track of commitments, surface blockers, and confirm next steps aloud.",
        metadata: {
          userId: session.user.id,
        },
      },
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    console.error("Failed to create realtime session", upstream.status, errorText);
    return NextResponse.json({ error: "Failed to create realtime session" }, { status: 500 });
  }

  const data = await upstream.json();
  return NextResponse.json(data);
}
