"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Link2,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  User,
  Bell,
  BarChart3,
  Trophy,
  Monitor,
  Sun,
  Moon,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";

interface LinkedAccount {
  provider: string;
  email?: string;
  connected: boolean;
  scopes?: string;
}

interface UserInfo {
  id: string;
  name?: string;
  email?: string;
  telegramId?: number;
}

interface LinkedAccountsDialogProps {
  userId: string;
  userTier?: string;
}

type NotificationInterval =
  | "15min"
  | "30min"
  | "1h"
  | "2h"
  | "4h"
  | "daily"
  | "off";

interface NotificationSettings {
  enabled: boolean;
  interval: NotificationInterval;
  timezone?: string;
  dailyHour?: number;
}

interface UsageErrorEntry {
  taskType: string;
  error?: string;
  createdAt: string;
  source?: string;
}

interface StatsResponse {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  totalToolCalls: number;
  failedRequests: number;
  rank: number | null;
  today: {
    requests: number;
    tokens: number;
    cost: number;
    failedRequests: number;
  };
  thisWeek: {
    requests: number;
    tokens: number;
    cost: number;
    avgCostPerDay: number;
    failedRequests: number;
  };
  thisMonth: {
    requests: number;
    tokens: number;
    cost: number;
    failedRequests: number;
  };
  recentLogs: unknown[];
  recentErrors: UsageErrorEntry[];
}

function formatTimeUntil(timestamp: string): string {
  const now = new Date();
  const target = new Date(timestamp);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return "Overdue";

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatTaskTypeLabel(taskType: string): string {
  switch (taskType) {
    case "daily_check":
      return "Daily Check";
    case "reminder":
      return "Reminder";
    case "notification":
      return "Notification";
    case "chat":
      return "Chat";
    default:
      return "Workflow";
  }
}

export function LinkedAccountsDialog({
  userTier = "free",
}: LinkedAccountsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>();
  const [savingNotif, setSavingNotif] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [taskInfo, setTaskInfo] = useState<{
    lastRunAt?: string;
    nextRunAt?: string;
    timezone?: string;
  } | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<{
    topUsers: Array<{ userName: string; totalRequests: number; rank: number }>;
    totalRealUsers: number;
  } | null>(null);
  const [showErrorList, setShowErrorList] = useState(false);
  const [hasChangedNotif, setHasChangedNotif] = useState(false);
  const { toast } = useToast();
  const { theme, selectedTheme, setTheme } = useTheme();
  const themeSelectionLabel =
    selectedTheme === "system"
      ? "Automatic"
      : selectedTheme === "dark"
        ? "Dark"
        : "Light";
  const themeHelperText =
    selectedTheme === "system"
      ? `Following system preference (${theme === "dark" ? "Dark" : "Light"} mode)`
      : `Theme locked to ${selectedTheme === "dark" ? "Dark" : "Light"} mode`;

  const fetchLinkedAccounts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("telegram-token");
      const [accountsRes, notifRes, statsRes, leaderboardRes] =
        await Promise.all([
          fetch(`/api/user/linked-accounts`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/user/notifications`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/user/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/leaderboard?limit=3`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setAccounts(data.accounts || []);
        setUser(data.user || null);
      }

      if (notifRes.ok) {
        const data = await notifRes.json();
        setNotifSettings(data);

        // Extract task info for display
        if (data.enabled && data.interval !== "off") {
          setTaskInfo({
            lastRunAt: data.lastRunAt,
            nextRunAt: data.nextRunAt,
            timezone:
              data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        } else {
          setTaskInfo(null);
        }
      }

      if (statsRes.ok) {
        const data: StatsResponse = await statsRes.json();
        setStats(data);
        setShowErrorList(false);
      }

      if (leaderboardRes.ok) {
        const data = await leaderboardRes.json();
        setLeaderboard(data);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUserId = async () => {
    if (user?.telegramId) {
      await navigator.clipboard.writeText(user.telegramId.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLinkedAccounts();
    }
  }, [open]);

  const handleConnectGoogle = () => {
    // Open the linking page in mobile browser (Telegram WebView doesn't support Google OAuth)
    const linkingUrl = `${window.location.origin}/link-telegram`;

    // Use Telegram WebApp API to open in external browser if available
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const telegram = (window as any).Telegram;
      if (telegram?.WebApp) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (telegram as any).WebApp.openLink(linkingUrl);
        return;
      }
    }

    // Fallback: open in new tab
    window.open(linkingUrl, "_blank");
  };

  const handleSaveNotifications = async (newInterval: NotificationInterval) => {
    setSavingNotif(true);
    setShowSaveSuccess(false);

    try {
      const token = localStorage.getItem("telegram-token");

      // For daily, add timezone and hour
      let payload = {
        enabled: newInterval !== "off",
        interval: newInterval,
        timezone: undefined as string | undefined,
        dailyHour: undefined as number | undefined,
      };

      if (newInterval === "daily") {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const dailyHour = now.getUTCHours();
        payload = { ...payload, timezone, dailyHour };
      }

      const response = await fetch("/api/user/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();

        // Mark that user has changed notification settings
        setHasChangedNotif(true);

        // Show success animation
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);

        // Update task info
        if (newInterval !== "off") {
          setTaskInfo({
            lastRunAt: data.lastRunAt,
            nextRunAt: data.nextRunAt,
            timezone:
              payload.timezone ||
              Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        } else {
          setTaskInfo(null);
        }

        toast({
          title: "Success",
          description: "Notification settings updated",
        });

        // Trigger immediate message for testing (only if not "off")
        if (newInterval !== "off") {
          fetch("/api/trigger-notification", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }).catch((err) => console.debug("Trigger notification failed:", err));
        }
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.error || "Failed to update settings",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to save notifications:", error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSavingNotif(false);
    }
  };

  const intervalOptions =
    userTier === "free"
      ? [
          { value: "off", label: "Off" },
          { value: "daily", label: "Daily" },
        ]
      : [
          { value: "off", label: "Off" },
          { value: "15min", label: "Every 15 minutes" },
          { value: "30min", label: "Every 30 minutes" },
          { value: "1h", label: "Every hour" },
          { value: "2h", label: "Every 2 hours" },
          { value: "4h", label: "Every 4 hours" },
          { value: "daily", label: "Daily" },
        ];

  const googleAccount = accounts.find((a) => a.provider === "google");
  const isGoogleConnected = googleAccount?.connected ?? false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle>Linked Accounts</DialogTitle>
              <DialogDescription>
                Manage your connected accounts and integrations
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 pb-4">
          {/* Telegram User Info */}

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium">Telegram User</p>
                <p className="text-sm text-muted-foreground">
                  {user?.name || "User"}
                </p>
              </div>
            </div>

            {user?.telegramId && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Your Telegram ID (for linking)
                </label>
                <div className="flex gap-2">
                  <Input
                    value={user.telegramId}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyUserId}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Appearance */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                {selectedTheme === "dark" ? (
                  <Moon className="h-5 w-5 text-amber-600 dark:text-amber-200" />
                ) : selectedTheme === "light" ? (
                  <Sun className="h-5 w-5 text-amber-600" />
                ) : (
                  <Monitor className="h-5 w-5 text-amber-600 dark:text-amber-200" />
                )}
              </div>
              <div>
                <p className="font-medium">Appearance</p>
                <p className="text-sm text-muted-foreground">
                  Choose how the Telegram mini app should look.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme-mode">Theme Mode</Label>
              <Select
                value={selectedTheme}
                onValueChange={(value) =>
                  setTheme(value as "light" | "dark" | "system")
                }
              >
                <SelectTrigger id="theme-mode">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      <span>Automatic</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{themeHelperText}</p>
            </div>
          </div>

          {/* Google */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Google</p>
                  {isGoogleConnected && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </div>
                {isGoogleConnected && googleAccount?.email ? (
                  <p className="text-sm text-muted-foreground">
                    {googleAccount.email}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Access your calendar events
                  </p>
                )}
              </div>
            </div>

            {isGoogleConnected ? (
              <Badge variant="secondary">Connected</Badge>
            ) : (
              <Button
                size="sm"
                onClick={handleConnectGoogle}
                disabled={loading}
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Connect
              </Button>
            )}
          </div>

          {/* Notification Settings */}
          {notifSettings && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                  <Bell className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="font-medium">Proactive Messages</p>
                  <p className="text-sm text-muted-foreground">
                    {notifSettings.interval === "off"
                      ? "Disabled"
                      : `Active: ${
                          intervalOptions.find(
                            (o) => o.value === notifSettings.interval
                          )?.label
                        }`}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notification-interval">
                  Message Frequency
                  {savingNotif && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Saving...
                    </span>
                  )}
                  {showSaveSuccess && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 animate-in fade-in">
                      <CheckCircle2 className="h-3 w-3" />
                      Saved!
                    </span>
                  )}
                </Label>
                <Select
                  value={notifSettings.interval}
                  onValueChange={(value) => {
                    const newInterval = value as NotificationInterval;
                    setNotifSettings({
                      ...notifSettings,
                      interval: newInterval,
                      enabled: newInterval !== "off",
                    });
                    handleSaveNotifications(newInterval);
                  }}
                  disabled={savingNotif}
                >
                  <SelectTrigger id="notification-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {intervalOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {userTier === "free" && (
                  <p className="text-xs text-muted-foreground">
                    💎 Upgrade to paid for more frequent messages (15min+)
                  </p>
                )}
              </div>

              {/* Timestamp Information - only show after user has changed settings */}
              {hasChangedNotif && taskInfo && (
                <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Timezone:</span>
                    <span className="font-medium">{taskInfo.timezone}</span>
                  </div>
                  {taskInfo.lastRunAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last Run:</span>
                      <span className="font-medium">
                        {new Date(taskInfo.lastRunAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {taskInfo.nextRunAt && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Next Run:</span>
                        <span className="font-medium">
                          {new Date(taskInfo.nextRunAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Time Until:
                        </span>
                        <span className="font-medium">
                          {formatTimeUntil(taskInfo.nextRunAt)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {notifSettings.interval === "daily" && notifSettings.enabled && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-900 dark:text-blue-100">
                  Daily messages will be sent at approximately the same time
                  each day
                </div>
              )}
            </div>
          )}

          {/* Stats Section */}
          {stats && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <BarChart3 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">Usage Stats</p>
                  <p className="text-sm text-muted-foreground">
                    Your activity and costs
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-2xl font-bold">{stats.totalRequests}</p>
                  <p className="text-xs text-muted-foreground">
                    Total Requests
                  </p>
                </div>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-2xl font-bold">
                    {(stats.totalTokens / 1000).toFixed(1)}k
                  </p>
                  <p className="text-xs text-muted-foreground">Tokens Used</p>
                </div>
                <div className="rounded-md bg-muted p-3 text-center col-span-2 sm:col-span-1">
                  <p
                    className={`text-2xl font-bold ${
                      stats.failedRequests > 0
                        ? "text-red-600 dark:text-red-400"
                        : ""
                    }`}
                  >
                    {stats.failedRequests}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Failed Requests
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Cost:</span>
                  <span className="font-medium">
                    €{stats.totalCost.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">This Week:</span>
                  <span className="font-medium">
                    €{stats.thisWeek.cost.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Weekly Avg/Day:</span>
                  <span className="font-medium">
                    €{stats.thisWeek.avgCostPerDay.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">This Month:</span>
                  <span className="font-medium">
                    €{stats.thisMonth.cost.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Failed This Week:
                  </span>
                  <span className="font-medium">
                    {stats.thisWeek.failedRequests}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Failed This Month:
                  </span>
                  <span className="font-medium">
                    {stats.thisMonth.failedRequests}
                  </span>
                </div>
              </div>

              <div className="pt-2 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <Badge
                    variant={
                      stats.today.failedRequests > 0
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    Failed runs today: {stats.today.failedRequests}
                  </Badge>
                  {stats.recentErrors.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setShowErrorList((prev) => !prev)}
                    >
                      {showErrorList ? "Hide errors" : "Show errors"}
                    </Button>
                  )}
                </div>
                {stats.recentErrors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No failed runs logged recently 🎉
                  </p>
                )}
                {showErrorList && stats.recentErrors.length > 0 && (
                  <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    {stats.recentErrors.map((entry, index) => {
                      const timestamp = new Date(entry.createdAt);
                      return (
                        <div
                          key={`${entry.createdAt}-${index}`}
                          className="space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-destructive">
                              {formatTaskTypeLabel(entry.taskType)}
                            </span>
                            <span className="text-muted-foreground">
                              {timestamp.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {entry.error || "No error message provided."}
                          </p>
                          {entry.source && (
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                              Source: {entry.source}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leaderboard Section */}
          {leaderboard && leaderboard.topUsers.length > 0 && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900">
                  <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="font-medium">Global Leaderboard</p>
                  <p className="text-sm text-muted-foreground">
                    Top users ({leaderboard.totalRealUsers} total)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {leaderboard.topUsers.map((entry) => (
                  <div
                    key={entry.rank}
                    className="flex items-center justify-between rounded-md bg-muted p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-muted-foreground">
                        #{entry.rank}
                      </span>
                      <span className="font-medium">{entry.userName}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {entry.totalRequests} requests
                    </span>
                  </div>
                ))}
              </div>

              {stats?.rank && (
                <div className="mt-3 rounded-md bg-primary/10 p-2 text-center text-sm">
                  <span className="font-medium">Your Rank: </span>
                  <span className="font-bold text-primary">#{stats.rank}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
