import type { NextRequest } from "next/server";

import { handlers } from "@/auth";

export async function GET(request: NextRequest) {
  try {
    return await handlers.GET(request);
  } catch (error) {
    console.error("[auth][GET]", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handlers.POST(request);
  } catch (error) {
    console.error("[auth][POST]", error);
    throw error;
  }
}
