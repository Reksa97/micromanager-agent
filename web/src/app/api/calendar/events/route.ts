import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { google, tasks_v1 } from "googleapis";

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
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({ access_token: accessToken });

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + (days - 1));
    end.setHours(23, 59, 59, 999);

    // Calendar events
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    const evRes = await calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
    });
    const eventItems =
      (evRes.data.items ?? []).map((e) => ({
        id: e.id ?? crypto.randomUUID(),
        title: e.summary ?? "Untitled event",
        start: e.start?.dateTime ?? e.start?.date ?? null,
        end: e.end?.dateTime ?? e.end?.date ?? null,
        location: e.location ?? undefined,
        description: e.description ?? undefined,
      })) || [];

    // Google Tasks (all lists, paginated). Best-effort; skips if scope/API not available.
    let taskItems:
      | {
          id: string;
          title: string;
          start: string | null;
          end: string | null;
          location?: string;
          description?: string;
        }[] = [];

    try {
      const tasksClient = google.tasks({ version: "v1", auth: oAuth2Client });

      // List all tasklists (paginate)
      const allTaskLists: tasks_v1.Schema$TaskList[] = [];
      let listPageToken: string | undefined = undefined;
      do {
        const tasklistsResp: tasks_v1.Params$Resource$Tasklists$List = {
          maxResults: 100,
          pageToken: listPageToken,
        };
        const tasklistsPage = await tasksClient.tasklists.list(tasklistsResp);
        allTaskLists.push(...(tasklistsPage.data.items ?? []));
        listPageToken = tasklistsPage.data.nextPageToken ?? undefined;
      } while (listPageToken);

      // Fetch tasks from each list (paginate per list)
      const collected: typeof taskItems = [];
      for (const tl of allTaskLists) {
        if (!tl.id) continue;
        let tasksPageToken: string | undefined = undefined;
        do {
          const tasksReq: tasks_v1.Params$Resource$Tasks$List = {
            tasklist: tl.id,
            showCompleted: false,
            showHidden: false,
            maxResults: 100,
            pageToken: tasksPageToken,
            dueMin: start.toISOString(),
            dueMax: end.toISOString(),
          };
          const tasksPage = await tasksClient.tasks.list(tasksReq);
          const items = tasksPage.data.items ?? [];
          for (const t of items) {
            // Only consider tasks that have a due date and are not completed
            if (t.status === "completed") continue;
            const dueStr = t.due ?? null;
            if (!dueStr) continue;
            const due = new Date(dueStr);
            if (Number.isNaN(due.getTime())) continue;
            if (due < start || due > end) continue;

            collected.push({
              id: t.id ?? crypto.randomUUID(),
              title: t.title ?? "Untitled task",
              start: due.toISOString(),
              end: due.toISOString(),
              description: t.notes ?? undefined,
            });
          }
          tasksPageToken = tasksPage.data.nextPageToken ?? undefined;
        } while (tasksPageToken);
      }
      taskItems = collected;
    } catch (taskError) {
      console.warn("[Calendar Events API] Tasks fetch skipped:", taskError);
    }

    // Merge and sort
    const all = [...eventItems, ...taskItems].map((x) => ({
      ...x,
      start: x.start ?? start.toISOString(),
      end: x.end ?? x.start ?? start.toISOString(),
    }));

    all.sort((a, b) => {
      const ta = new Date(a.start as string).getTime();
      const tb = new Date(b.start as string).getTime();
      return ta - tb;
    });

    return NextResponse.json({ events: all });
  } catch (error) {
    console.error("[Calendar Events API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
