import { tasks_v1 } from "googleapis";

export type TaskList = {
    id: string;
    title: string;
};

export type TaskItem = {
    id?: string;
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
        for (const taskList of tasklistsPage.data.items ?? []) {
            if (!taskList.id ) { continue }
            allTaskLists.push({
                id: taskList.id,
                title: taskList.title ?? "Untitled task list"
            })
        }
        listPageToken = tasklistsPage.data.nextPageToken ?? undefined;
    } while (listPageToken);
    return allTaskLists
}

export const insertTaskList = async (tasksClient: tasks_v1.Tasks, title: string) => {
    const taskList: tasks_v1.Schema$TaskList = {
        title
    };
    const response = await tasksClient.tasklists.insert({
        requestBody: taskList
    });
    return {
        id: response.data.id ?? undefined,
        title: response.data.title ?? "Untitled task list"
    };
};

export const updateTaskList = async (tasksClient: tasks_v1.Tasks, tasklistId: string, title: string | undefined) => {
    const taskList: tasks_v1.Schema$TaskList = {
        ...(title ? { title } : {})
    };
    const response = await tasksClient.tasklists.patch({
        tasklist: tasklistId,
        requestBody: taskList
    });
        return {
        id: response.data.id ?? undefined,
        title: response.data.title ?? "Untitled task list"
    };
};

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
                id: task.id ?? undefined,
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
    return collected;
};

export const insertTask = async (
    tasksClient: tasks_v1.Tasks,
    tasklistId: string,
    title: string,
    description: string,
    due: string
) => {
    const task : tasks_v1.Schema$Task = {
        title,
        notes: description,
        status: "needsAction",
        due,
    }
    const response = await tasksClient.tasks.insert({
        tasklist: tasklistId,
        requestBody: task
    });
    return {
        id: response.data.id ?? undefined,
        title: response.data.title ?? "Untitled event",
        due: response.data.due ?? undefined,
        description: response.data.notes ?? undefined,
        status: response.data.status ?? "Missing status",
        completed: response.data.completed ?? undefined,
    };
};

export const updateTask = async (
    tasksClient: tasks_v1.Tasks,
    taskId: string,
    tasklistId: string,
    title: string | undefined,
    description: string | undefined,
    status: string | undefined,
    due: string | undefined
) => {
    const task : tasks_v1.Schema$Task = {
        ...(title ? { title } : {}),
        ...(description ? { notes: description } : {}),
        ...(status ? { status } : {}),
        ...(due ? { due } : {}),
    }
    const response = await tasksClient.tasks.patch({
        tasklist: tasklistId,
        task: taskId,
        requestBody: task
    });
    return {
        id: response.data.id ?? undefined,
        title: response.data.title ?? "Untitled event",
        due: response.data.due ?? undefined,
        description: response.data.notes ?? undefined,
        status: response.data.status ?? "Missing status",
        completed: response.data.completed ?? undefined,
    };
};

export const clearTasks = async (tasksClient: tasks_v1.Tasks, tasklistId: string) => {
    const response = await tasksClient.tasks.clear({ tasklist: tasklistId });
    return response;
};
