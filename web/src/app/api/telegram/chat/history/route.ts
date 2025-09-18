import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRecentMessages } from "@/lib/conversations";
import { env } from "@/env";

export async function GET(req: NextRequest) {
  try {
    // Verify JWT token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload;
    try {
      const verified = await jwtVerify(token, env.JWT_SECRET);
      payload = verified.payload;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.sub as string;

    // Get recent messages
    const messages = await getRecentMessages(userId, 50);

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
