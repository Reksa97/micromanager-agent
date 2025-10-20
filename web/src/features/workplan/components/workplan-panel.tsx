"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { WORKPLAN_DEFAULT_EVENT_LIMIT } from "@/lib/constants";
import { Input } from "@/components/ui/input";

type WorkplanStatus = "ready" | "stale" | "error";

type WorkplanEntry = {
  event: {
    id: string;
    title: string;
    start?: string | null;
    end?: string | null;
    location?: string | null;
    description?: string | null;
  };
  steps: string[];
  status: WorkplanStatus;
  lastGeneratedAt?: string;
  error?: string;
  source?: string | null;
  role?: string | null;
};

const UPCOMING_DAYS = 7;

export function WorkPlanPanel() {
  const [workplans, setWorkplans] = useState<WorkplanEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingList(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/workplan?days=${UPCOMING_DAYS}&limit=${WORKPLAN_DEFAULT_EVENT_LIMIT}`,
          {
            cache: "no-store",
          }
        );
        if (!res.ok) {
          throw new Error(`Failed to load workplans (status ${res.status})`);
        }
        const data = (await res.json()) as { workplans?: WorkplanEntry[] };
        const items = (data.workplans ?? []).filter(Boolean);
        if (!cancelled) {
          if (items.length === 0) {
            const mocks = getMockWorkplans();
            setWorkplans(mocks);
            setRoleDrafts(
              mocks.reduce<Record<string, string>>((acc, item) => {
                acc[item.event.id] = item.role?.trim() ?? "";
                return acc;
              }, {})
            );
            setSelectedId(mocks[0]?.event.id ?? null);
          } else {
            setWorkplans(items);
            setRoleDrafts((prev) => {
              const next = { ...prev };
              for (const item of items) {
                if (typeof next[item.event.id] === "undefined") {
                  next[item.event.id] = item.role?.trim() ?? "";
                }
              }
              return next;
            });
            setSelectedId(items[0]?.event.id ?? null);
          }
        }
      } catch (err) {
        console.error("[WorkplanPanel] Load error:", err);
        if (!cancelled) {
          const mocks = getMockWorkplans();
          setWorkplans(mocks);
          setRoleDrafts(
            mocks.reduce<Record<string, string>>((acc, item) => {
              acc[item.event.id] = item.role?.trim() ?? "";
              return acc;
            }, {})
          );
          setSelectedId(mocks[0]?.event.id ?? null);
          setError("Failed to load upcoming workplans. Showing examples.");
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => workplans.find((item) => item.event.id === selectedId) ?? null,
    [workplans, selectedId]
  );
  const selectedRoleDraft = selected
    ? roleDrafts[selected.event.id] ?? ""
    : "";
  const selectedRoleFallback =
    selected && selected.role
      ? selected.role.trim()
      : selected
      ? inferRoleFromEvent(selected.event)
      : "";
  const selectedRoleDisplay =
    selected && selectedRoleDraft.trim().length === 0
      ? selectedRoleFallback
      : selectedRoleDraft.trim();

  function handleRoleChange(eventId: string, value: string) {
    setRoleDrafts((prev) => ({
      ...prev,
      [eventId]: value,
    }));
    setWorkplans((prev) =>
      prev.map((item) =>
        item.event.id === eventId
          ? {
              ...item,
              role: normaliseRole(value),
            }
          : item
      )
    );
  }

  async function handleRegenerate() {
    if (!selected) return;
    setRegenerating(true);
    setError(null);
    try {
      const draftRole = roleDrafts[selected.event.id] ?? "";
      const payloadRole = normaliseRole(draftRole);
      const res = await fetch("/api/workplan/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: selected.event,
          userRole: payloadRole ?? undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`Regeneration failed with status ${res.status}`);
      }
      const data = (await res.json()) as {
        event: WorkplanEntry["event"];
        steps: string[];
        status: WorkplanStatus;
        lastGeneratedAt?: string;
        role?: string | null;
      };
      setWorkplans((prev) =>
        prev.map((item) =>
          item.event.id === selected.event.id
            ? {
                ...item,
                steps: data.steps ?? [],
                status: data.status ?? "ready",
                lastGeneratedAt: data.lastGeneratedAt,
                error: undefined,
                role:
                  normaliseRole(data.role ?? undefined) ??
                  payloadRole ??
                  null,
              }
            : item
        )
      );
      setRoleDrafts((prev) => ({
        ...prev,
        [selected.event.id]:
          selectedRoleDraft.trim().length > 0
            ? selectedRoleDraft.trim()
            : data.role ?? "",
      }));
    } catch (err) {
      console.error("[WorkplanPanel] Regenerate error:", err);
      setError("Unable to regenerate workplan right now. Try again later.");
    } finally {
      setRegenerating(false);
    }
  }

  const selectedContent = selected ? (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {selected.event.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatEventDateRange(
                selected.event.start ? new Date(selected.event.start) : null,
                selected.event.end ? new Date(selected.event.end) : null
              )}
            </span>
            {selected.event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {selected.event.location}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
              Role
            </span>
            <Input
              value={selectedRoleDraft}
              onChange={(event) =>
                handleRoleChange(selected.event.id, event.target.value)
              }
              placeholder={inferRoleFromEvent(selected.event)}
              className="h-9 w-full min-w-[180px]"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerating || loadingList}
            className="gap-2"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Regenerate plan
          </Button>
        </div>
      </div>

      {selected.error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {selected.error}
        </div>
      )}

      <div className="space-y-1 text-sm text-muted-foreground">
        {selectedRoleDisplay && (
          <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
            {/* Assuming role:{" "}
            <span className="font-semibold text-foreground">
              {selectedRoleDisplay}
            </span> */}
          </p>
        )}
        {selected.event.description && (
          <p className="leading-relaxed">{selected.event.description}</p>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/80">
          Planned Steps
        </h4>
        {selected.steps.length === 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
            No plan available yet. Try regenerating once the agent can reach your
            calendar.
          </div>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
            {selected.steps.map((step, index) => (
              <li key={index} className="leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Calendar className="h-8 w-8" />
      Select an upcoming event to see its workplan.
    </div>
  );

  return (
    <Card className="border border-border/70 bg-card/80 shadow-lg">
      <CardHeader className="flex flex-col gap-2">
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <Calendar className="h-5 w-5" />
          Upcoming Workplans
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Micromanager auto-prepares step-by-step plans for your next{" "}
          {WORKPLAN_DEFAULT_EVENT_LIMIT} calendar events. Select an event to see
          the cached plan or regenerate it for fresh guidance.
        </p>
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-border/60 bg-background/60">
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y divide-border/60">
              {loadingList ? (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading events...
                </div>
              ) : workplans.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  No upcoming events found.
                </div>
              ) : (
                workplans.map((item) => {
                  const isActive = item.event.id === selectedId;
                  const startDate = item.event.start
                    ? new Date(item.event.start)
                    : null;
                  const endDate = item.event.end
                    ? new Date(item.event.end)
                    : null;
                  return (
                    <button
                      key={item.event.id}
                      type="button"
                      onClick={() => setSelectedId(item.event.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3 text-left transition",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <span className="text-sm font-medium">
                        {item.event.title}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatEventDateRange(startDate, endDate)}
                      </span>
                      {item.event.location && (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {item.event.location}
                        </span>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <StatusBadge status={item.status} />
                        {item.lastGeneratedAt && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                            Updated {timeAgo(item.lastGeneratedAt)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/60 p-6">
          {selectedContent}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: WorkplanStatus }) {
  if (status === "ready") {
    return (
      <Badge
        variant="secondary"
        className="flex items-center gap-1 border-none bg-emerald-500/10 text-emerald-600"
      >
        <CheckCircle2 className="h-3 w-3" />
        Ready
      </Badge>
    );
  }
  if (status === "stale") {
    return (
      <Badge variant="secondary" className="border-none bg-amber-500/10 text-amber-600">
        Needs refresh
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="border-none bg-destructive/10 text-destructive">
      Error
    </Badge>
  );
}

function formatEventDateRange(start: Date | null, end: Date | null) {
  if (!start && !end) {
    return "No time specified";
  }
  if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    const sameDay =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate();
    if (sameDay) {
      return `${formatDate(start)} · ${formatTime(start)}–${formatTime(end)}`;
    }
    return `${formatDate(start)} ${formatTime(start)} · ${formatDate(end)} ${formatTime(end)}`;
  }
  const target = start ?? end;
  if (!target || Number.isNaN(target.getTime())) {
    return "No time specified";
  }
  return `${formatDate(target)} · ${formatTime(target)}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(dateIso: string) {
  const ts = new Date(dateIso).getTime();
  if (Number.isNaN(ts)) return "unknown";
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / (60 * 1000));
    return `${mins}m ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hrs = Math.floor(diff / (60 * 60 * 1000));
    return `${hrs}h ago`;
  }
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return `${days}d ago`;
}

function getMockWorkplans(): WorkplanEntry[] {
  const mocks = getMockEvents();
  return mocks.map((event) => ({
    event,
    steps: generateMockPlan(event),
    status: "ready",
    lastGeneratedAt: new Date().toISOString(),
    role: "attendee",
  }));
}

function getMockEvents() {
  return [
    {
      id: "evt-1",
      title: "Cooking Dinner: Veggie Stir Fry",
      start: withTodayTime(18, 0).toISOString(),
      end: withTodayTime(19, 0).toISOString(),
      location: "Home Kitchen",
      description: "Quick mid-week dinner.",
    },
    {
      id: "evt-2",
      title: "Team Sync",
      start: withTodayTime(10, 30).toISOString(),
      end: withTodayTime(11, 0).toISOString(),
      location: "Zoom",
      description: "Daily standup and blockers.",
    },
    {
      id: "evt-3",
      title: "Workout: Cardio + Mobility",
      start: addDays(withTodayTime(7, 0), 1).toISOString(),
      end: addDays(withTodayTime(8, 0), 1).toISOString(),
      location: "Local Gym",
      description: "Mobility warm-up and cardio session.",
    },
  ];
}

function generateMockPlan(event: WorkplanEntry["event"]) {
  const title = event.title.toLowerCase();
  if (title.includes("sync") || title.includes("meeting") || title.includes("standup")) {
    return [
      "Review agenda and pre-reads; track open questions.",
      "Join on time with camera and mic ready.",
      "Share concise updates and blockers.",
      "Capture decisions and action items.",
      "Assign owners and due dates.",
      "Follow up with summary notes.",
    ];
  }
  if (title.includes("cook") || title.includes("dinner") || title.includes("recipe")) {
    return [
      "Confirm servings and dietary needs.",
      "Check pantry; add missing ingredients to list.",
      "Prep mise en place: chop, wash, measure.",
      "Preheat appliances and set timers.",
      "Cook following recipe timing and taste adjustments.",
      "Plate, serve, and handle quick cleanup.",
    ];
  }
  if (title.includes("workout") || title.includes("gym") || title.includes("run")) {
    return [
      "Gather workout gear and hydrate.",
      "Complete dynamic warm-up.",
      "Execute main sets with proper form.",
      "Log reps/weights for tracking.",
      "Finish with cool-down and stretching.",
      "Review progress and plan next session.",
    ];
  }
  return [
    "Review event objective and expectations.",
    "Gather required materials or background info.",
    "Plan your contribution and key talking points.",
    "Arrive on time with clear priorities.",
    "Capture your action items as they arise.",
    "Schedule follow-up or next steps immediately after.",
  ];
}

function withTodayTime(hours: number, minutes: number) {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + amount);
  return next;
}

function normaliseRole(role?: string | null): string | null {
  if (!role) return null;
  const trimmed = role.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function inferRoleFromEvent(event: WorkplanEntry["event"]) {
  const title = (event.title || "").toLowerCase();
  if (title.match(/\b(cook|dinner|recipe|kitchen)\b/)) return "cook";
  if (title.match(/\b(clean|laundry|chores)\b/)) return "cleaner";
  if (title.match(/\b(workout|gym|run|training)\b/)) return "athlete";
  if (title.match(/\b(meeting|sync|standup|review|retro)\b/))
    return "facilitator";
  if (title.match(/\b(class|study|lesson|lecture)\b/)) return "student";
  return "attendee";
}
