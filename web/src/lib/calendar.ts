import { google, tasks_v1 } from "googleapis";

export type CalendarLikeItem = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  location?: string;
  description?: string;
};

export async function fetchUpcomingCalendarItems(
  accessToken: string,
  days: number,
  limit?: number
): Promise<CalendarLikeItem[]> {
  const oAuth2Client = new google.auth.OAuth2();
  oAuth2Client.setCredentials({ access_token: accessToken });

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + (days - 1));
  end.setHours(23, 59, 59, 999);

  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  const eventsRes = await calendar.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  const calendarItems: CalendarLikeItem[] =
    (eventsRes.data.items ?? []).map((event) => ({
      id: event.id ?? crypto.randomUUID(),
      title: event.summary ?? "Untitled event",
      start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null,
      location: event.location ?? undefined,
      description: event.description ?? undefined,
    })) ?? [];

  const taskItems: CalendarLikeItem[] = await fetchTasksWithinWindow(
    oAuth2Client,
    start,
    end
  );

  const combined = [...calendarItems, ...taskItems].map((item) => ({
    ...item,
    start: item.start ?? start.toISOString(),
    end: item.end ?? item.start ?? start.toISOString(),
  }));

  combined.sort((a, b) => {
    const ta = new Date(a.start as string).getTime();
    const tb = new Date(b.start as string).getTime();
    return ta - tb;
  });

  return typeof limit === "number" && limit > 0
    ? combined.slice(0, limit)
    : combined;
}

async function fetchTasksWithinWindow(
  auth: tasks_v1.Options["auth"],
  start: Date,
  end: Date
): Promise<CalendarLikeItem[]> {
  try {
    const tasksClient = google.tasks({ version: "v1", auth });

    const allTaskLists: tasks_v1.Schema$TaskList[] = [];
    let listPageToken: string | undefined;
    do {
      const tasklistsResp: tasks_v1.Params$Resource$Tasklists$List = {
        maxResults: 100,
        pageToken: listPageToken,
      };
      const tasklistsPage = await tasksClient.tasklists.list(tasklistsResp);
      allTaskLists.push(...(tasklistsPage.data.items ?? []));
      listPageToken = tasklistsPage.data.nextPageToken ?? undefined;
    } while (listPageToken);

    const collected: CalendarLikeItem[] = [];
    for (const taskList of allTaskLists) {
      if (!taskList.id) continue;
      let tasksPageToken: string | undefined;
      do {
        const tasksReq: tasks_v1.Params$Resource$Tasks$List = {
          tasklist: taskList.id,
          showCompleted: false,
          showHidden: false,
          maxResults: 100,
          pageToken: tasksPageToken,
          dueMin: start.toISOString(),
          dueMax: end.toISOString(),
        };
        const tasksPage = await tasksClient.tasks.list(tasksReq);
        const items = tasksPage.data.items ?? [];
        for (const task of items) {
          if (task.status === "completed") continue;
          const dueStr = task.due ?? null;
          if (!dueStr) continue;
          const due = new Date(dueStr);
          if (Number.isNaN(due.getTime())) continue;
          if (due < start || due > end) continue;

          collected.push({
            id: task.id ?? crypto.randomUUID(),
            title: task.title ?? "Untitled task",
            start: due.toISOString(),
            end: due.toISOString(),
            description: task.notes ?? undefined,
          });
        }
        tasksPageToken = tasksPage.data.nextPageToken ?? undefined;
      } while (tasksPageToken);
    }
    return collected;
  } catch (error) {
    console.warn("[Calendar] Tasks fetch skipped:", error);
    return [];
  }
}
