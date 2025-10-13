import { redirect } from "next/navigation";
import { ChatPanel } from "@/features/chat/components/chat-panel";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkPlanPanel } from "@/features/workplan/components/workplan-panel";


export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-6 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lg backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Badge
            variant="secondary"
            className="uppercase tracking-[0.35em] text-[10px]"
          >
            Micromanager
          </Badge>
          <h1 className="text-3xl font-semibold text-foreground">
            AI Agent Control Room
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Manage conversations, escalate blockers, and spin up realtime
            copilots powered by GPT Realtime. Messages are persisted per user
            once complete.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
          <div className="flex flex-col text-sm">
            <span className="font-medium text-foreground">
              {session.user.email ?? session.user.name ?? "User"}
            </span>
            <span className="text-xs text-muted-foreground">
              Authenticated workspace
            </span>
          </div>
          <form action={handleSignOut}>
            <Button variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <ChatPanel />
      <WorkPlanPanel />
    </main>
  );
}
