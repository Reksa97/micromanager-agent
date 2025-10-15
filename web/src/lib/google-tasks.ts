import { tasks_v1 } from "googleapis";

export type TaskList = {
    id?: string;
    title: string;
}

export type TaskItem = {
    id: string;
    title: string;
    due?: string;
    description?: string;
    status: string;
    completed?: string;
};

export const getTaskLists = async (tasksClient: tasks_v1.Tasks) => {
    const allTaskLists: TaskList[] = [];
    let listPageToken: string | undefined = undefined;
    do {
        const tasklistsResp: tasks_v1.Params$Resource$Tasklists$List = {
            maxResults: 100,
            pageToken: listPageToken,
        };
        const tasklistsPage = await tasksClient.tasklists.list(tasklistsResp);
        const items: TaskList[] = tasklistsPage.data.items?.map(taskList => ({
            id: taskList.id ?? undefined,
            title: taskList.title ?? "Untitled task list"
        })) ?? []
        allTaskLists.push(...items)
        listPageToken = tasklistsPage.data.nextPageToken ?? undefined;
    } while (listPageToken);
    return allTaskLists
}

export const getTasks = async (
    tasksClient: tasks_v1.Tasks,
    allTaskLists: TaskList[],
    showCompleted: boolean,
    dueMin: string,
    dueMax: string,
) => {
    const collected: TaskItem[] = [];
    for (const tl of allTaskLists) {
    if (!tl.id) continue;
    let tasksPageToken: string | undefined = undefined;
    do {
        const tasksReq: tasks_v1.Params$Resource$Tasks$List = {
            tasklist: tl.id,
            showCompleted,
            showHidden: false,
            maxResults: 100,
            pageToken: tasksPageToken,
            dueMin,
            dueMax,
        };
        const tasksPage = await tasksClient.tasks.list(tasksReq);
        const tasks = tasksPage.data.items ?? [];
        const items: TaskItem[] = tasks.map(task => ({
            id: task.id ?? crypto.randomUUID(),
            title: task.title ?? "Untitled event",
            due: task.due ?? undefined,
            description: task.notes ?? undefined,
            status: task.status ?? "Missing status",
            completed: task.completed ?? undefined,
        }));
        collected.push(...items);
        
        tasksPageToken = tasksPage.data.nextPageToken ?? undefined;
    } while (tasksPageToken);
    }
    return collected
}
