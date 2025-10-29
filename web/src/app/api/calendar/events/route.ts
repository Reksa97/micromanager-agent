import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchUpcomingCalendarItems } from "@/lib/calendar";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = session.googleAccessToken;
  if (!accessToken) {
    return NextResponse.json({ events: [] }, { status: 200 });
  }

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(60, daysParam)) : 7;

  try {
    const events = await fetchUpcomingCalendarItems(accessToken, days);
    return NextResponse.json({ events });
  } catch (error) {
    console.error("[Calendar Events API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
