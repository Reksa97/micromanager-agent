"use client";

import { useMemo, useState, useEffect } from "react";
import { Calendar, CheckCircle2, Clock, MapPin, ListTodo, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
};

// Configure how many upcoming days to load from Calendar.
// Change this constant to restrict the planning window.
const UPCOMING_DAYS = 7;

export function WorkPlanPanel({ events: externalEvents }: { events?: CalendarEvent[] }) {
  // Prefer external events if provided
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    externalEvents && externalEvents.length ? externalEvents : []
  );
  const [loadingEvents, setLoadingEvents] = useState(!externalEvents || externalEvents.length === 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false); // default attendee
  const [roleInput, setRoleInput] = useState("");        // highest priority when non-empty

  // Fetch events from API if not passed in
  useEffect(() => {
    if (externalEvents && externalEvents.length) return;
    let isMounted = true;
    const load = async () => {
      setLoadingEvents(true);
      setError(null);
      try {
        const res = await fetch(`/api/calendar/events?days=${UPCOMING_DAYS}`, { cache: "no-store" });
        const data = (await res.json()) as { events?: Array<{ id: string; title: string; start?: string; end?: string; location?: string; description?: string }> };
        const mapped: CalendarEvent[] =
          (data.events ?? []).map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start ? new Date(e.start) : new Date(),
            end: e.end ? new Date(e.end) : new Date(),
            location: e.location,
            description: e.description,
          })) || [];
        if (isMounted) {
          setEvents(mapped.length ? mapped : getMockEvents());
          setSelectedId((mapped[0] ?? getMockEvents()[0])?.id ?? null);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setEvents(getMockEvents());
          setSelectedId(getMockEvents()[0]?.id ?? null);
          setError("Failed to load calendar events. Showing examples.");
        }
      } finally {
        if (isMounted) setLoadingEvents(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [externalEvents]);

  // Keep selection valid
  useEffect(() => {
    if (!events.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !events.some((e) => e.id === selectedId)) {
      setSelectedId(events[0].id);
    }
  }, [events, selectedId]);

  // Generate plan whenever selection or role changes
  useEffect(() => {
    const evt = events.find((e) => e.id === selectedId);
    if (!evt) {
      setPlan([]);
      return;
    }
    let isMounted = true;

    const run = async () => {
      setLoadingPlan(true);
      setError(null);
      const effectiveRole =
        roleInput.trim() || (isOrganizer ? "organizer/speaker" : "attendee");
      try {
        const res = await fetch("/api/workplan/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: {
              id: evt.id,
              title: evt.title,
              start: evt.start?.toISOString(),
              end: evt.end?.toISOString(),
              location: evt.location,
              description: evt.description,
            },
            userRole: effectiveRole,
          }),
        });
        if (!res.ok) {
          throw new Error(`Plan generation failed: ${res.status}`);
        }
        const data = (await res.json()) as { steps?: string[] };
        if (isMounted) {
          const steps = (data.steps ?? []).filter(Boolean);
          setPlan(steps.length ? steps : generatePlan(evt, effectiveRole));
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setPlan(generatePlan(evt, effectiveRole));
      } finally {
        if (isMounted) setLoadingPlan(false);
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, [selectedId, events, isOrganizer, roleInput]);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1.8fr]">
      <Card className="glass border border-border/70">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold">Work Plan Assistant</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click an upcoming event to view a step-by-step plan.
            </p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <ListTodo className="h-4 w-4" />
            Upcoming
          </div>
        </CardHeader>
        <CardContent className="h-[560px] p-0">
          <ScrollArea className="h-full">
            {loadingEvents ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading events…
              </div>
            ) : (
              <ul className="flex flex-col gap-2 p-4">
                {events.map((evt) => {
                  const isActive = evt.id === selectedId;
                  const dayBadge = getDayBadge(evt.start);
                  return (
                    <li key={evt.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(evt.id)}
                        className={cn(
                          "w-full rounded-2xl border p-4 text-left transition",
                          "hover:bg-muted/40 hover:border-border/80",
                          isActive ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/80",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{evt.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatRange(evt.start, evt.end)}
                              </span>
                              {evt.location ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {evt.location}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <Badge variant={isActive ? "default" : "secondary"}>{dayBadge}</Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground">{error}</p>
            ) : null}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card/90 shadow-inner">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="inline-flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {selected ? selected.title : "No event selected"}
            </span>
            {/* Role controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="role-toggle" className="text-xs text-muted-foreground">
                  Organizer/Speaker
                </Label>
                <Switch
                  id="role-toggle"
                  checked={isOrganizer}
                  onCheckedChange={(v) => setIsOrganizer(Boolean(v))}
                />
              </div>
            </div>
          </CardTitle>
          <div className="mt-3 grid gap-2">
            <Label htmlFor="custom-role" className="text-xs text-muted-foreground">
              My role (optional, overrides toggle)
            </Label>
            <Input
              id="custom-role"
              placeholder="e.g., Volunteer coordinator, Panelist, Photographer"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {selected ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {formatRange(selected.start, selected.end)}
                </span>
                {selected.location ? (
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {selected.location}
                  </span>
                ) : null}
              </div>

              {selected.description ? (
                <p className="text-sm text-muted-foreground/90">{selected.description}</p>
              ) : null}

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Suggested Plan
                </p>
                {loadingPlan ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating plan…
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {plan.map((step, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                        <div className="text-sm leading-relaxed">
                          <span className="font-medium text-foreground">Step {idx + 1}:</span>{" "}
                          <span className="text-foreground/90">{step}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Select an event to view its plan.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helpers (update fallback generator signature)

function withTodayTime(h: number, m: number) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}
function addDays(d: Date, days: number) {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}
function formatRange(start: Date, end: Date) {
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const datePart = dateFmt.format(start);
  const startT = timeFmt.format(start);
  const endT = timeFmt.format(end);
  return sameDay ? `${datePart}, ${startT} – ${endT}` : `${startT} – ${endT}`;
}
function getDayBadge(d: Date) {
  const now = new Date();
  const today =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const tomorrow = isTomorrow(d, now);
  if (today) return "Today";
  if (tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);
}
function isTomorrow(d: Date, ref: Date) {
  const t = new Date(ref);
  t.setDate(ref.getDate() + 1);
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

// Fallbacks when API fails or Google not connected
function generatePlan(evt: CalendarEvent, role: string): string[] {
  const r = (role || "").toLowerCase();
  const t = evt.title.toLowerCase();

  const isOrganizerRole = /organizer|speaker|host|presenter|facilitator/.test(r);
  const isAttendeeRole = /attend/.test(r) || !isOrganizerRole;

  if (t.includes("sync") || t.includes("meeting") || t.includes("standup")) {
    if (isOrganizerRole) {
      return [
        "Finalize agenda and objectives; confirm time and attendees.",
        "Prepare materials/links and pre-read; share 2–3 goals.",
        "Kick off on time; assign notetaker and timekeeper.",
        "Facilitate discussion; keep scope tight and decisions explicit.",
        "Record action items with owners and due dates.",
        "Send notes and next steps post-meeting.",
      ];
    }
    // attendee
    return [
      "Review agenda and pre-reads; list your updates/questions.",
      "Join on time; check mic/camera and environment.",
      "Share concise status and blockers when prompted.",
      "Capture takeaways and action items relevant to you.",
      "Clarify owners/dates for your tasks.",
      "Block follow-up time to execute next steps.",
    ];
  }

  if (t.includes("cook") || t.includes("dinner") || t.includes("recipe")) {
    if (isOrganizerRole) {
      return [
        "Select recipe and servings; check dietary needs.",
        "Inventory ingredients; plan substitutions and shopping.",
        "Mise en place: wash, chop, pre-measure all items.",
        "Preheat and stage cookware; sequence steps for timing.",
        "Cook and taste; adjust seasoning; plate warm.",
        "Assign quick cleanup; label/store leftovers.",
      ];
    }
    return [
      "Confirm the recipe and any dietary constraints.",
      "Offer to prep simple tasks (wash/chop) if helpful.",
      "Arrive on time with any assigned ingredients/utensils.",
      "Follow host instructions; keep station tidy.",
      "Help plate/serve; offer to do a quick cleanup pass.",
      "Share feedback and note favorites for next time.",
    ];
  }

  if (t.includes("workout") || t.includes("gym") || t.includes("run")) {
    return [
      "Pack essentials (water, towel, shoes); eat a light snack if needed.",
      "5–10 min dynamic warm-up targeting session muscles.",
      "Main sets per plan; keep form and track RPE.",
      "Accessory/mobility work for weak points.",
      "Cool down and stretch; hydrate and log session.",
      "Review progress; plan next session tweaks.",
    ];
  }

  // Generic fallback tailored by role
  if (isOrganizerRole) {
    return [
      "Define objective, success criteria, and constraints.",
      "Draft agenda/plan; assign roles; secure resources.",
      "Communicate expectations and pre-work to participants.",
      "Execute; track decisions and action items live.",
      "Close with owners/due dates; share notes promptly.",
      "Schedule follow-up and risk mitigations.",
    ];
  }
  return [
    "Understand the objective and your responsibilities.",
    "Review any pre-work; gather needed materials.",
    "Arrive prepared and on time; clarify expectations.",
    "Contribute effectively; ask concise questions.",
    "Capture your action items and deadlines.",
    "Follow up and report progress.",
  ];
}

function getMockEvents(): CalendarEvent[] {
  return [
    {
      id: "evt-1",
      title: "Cooking Dinner: Veggie Stir Fry",
      start: withTodayTime(18, 0),
      end: withTodayTime(19, 0),
      location: "Home Kitchen",
      description: "Quick mid-week dinner.",
    },
    {
      id: "evt-2",
      title: "Team Sync",
      start: withTodayTime(10, 30),
      end: withTodayTime(11, 0),
      location: "Zoom",
      description: "Daily standup and blockers.",
    },
    {
      id: "evt-3",
      title: "Workout: Cardio + Mobility",
      start: addDays(withTodayTime(7, 0), 1),
      end: addDays(withTodayTime(8, 0), 1),
      location: "Local Gym",
    },
  ];
}
