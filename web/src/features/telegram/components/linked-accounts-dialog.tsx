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
import { Settings, Link2, CheckCircle2, ExternalLink, Copy, Check, User, Bell } from "lucide-react";
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

type NotificationInterval = "15min" | "30min" | "1h" | "2h" | "4h" | "daily" | "off";

interface NotificationSettings {
  enabled: boolean;
  interval: NotificationInterval;
  timezone?: string;
  dailyHour?: number;
}

export function LinkedAccountsDialog({ userTier = "free" }: LinkedAccountsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    enabled: false,
    interval: "off",
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const { toast } = useToast();

  const fetchLinkedAccounts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("telegram-token");
      const [accountsRes, notifRes] = await Promise.all([
        fetch(`/api/user/linked-accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/user/notifications`, {
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
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const telegram = (window as any).Telegram;
      if (telegram?.WebApp) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (telegram as any).WebApp.openLink(linkingUrl);
        return;
      }
    }

    // Fallback: open in new tab
    window.open(linkingUrl, '_blank');
  };

  const handleSaveNotifications = async () => {
    setSavingNotif(true);
    try {
      const token = localStorage.getItem("telegram-token");

      // For daily, add timezone and hour
      let payload = notifSettings;
      if (notifSettings.interval === "daily" && notifSettings.enabled) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const dailyHour = now.getUTCHours();
        payload = { ...notifSettings, timezone, dailyHour };
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
        toast({
          title: "Success",
          description: "Notification settings updated",
        });
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

  const intervalOptions = userTier === "free"
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Linked Accounts</DialogTitle>
          <DialogDescription>
            Manage your connected accounts and integrations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Telegram User Info */}
          {user && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                  <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium">Telegram User</p>
                  <p className="text-sm text-muted-foreground">{user.name || "User"}</p>
                </div>
              </div>

              {user.telegramId && (
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
          )}

          {/* Notification Settings */}
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
                    : `Active: ${intervalOptions.find((o) => o.value === notifSettings.interval)?.label}`}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification-interval">Message Frequency</Label>
              <Select
                value={notifSettings.interval}
                onValueChange={(value) =>
                  setNotifSettings({
                    ...notifSettings,
                    interval: value as NotificationInterval,
                    enabled: value !== "off",
                  })
                }
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

            {notifSettings.interval === "daily" && notifSettings.enabled && (
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Daily messages will be sent at approximately the same time each day
                based on your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
              </div>
            )}

            <Button
              onClick={handleSaveNotifications}
              disabled={savingNotif || loading}
              className="w-full"
              size="sm"
            >
              {savingNotif ? "Saving..." : "Save Notification Settings"}
            </Button>
          </div>

          {/* Google Calendar */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Google Calendar</p>
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

          {/* More integrations can be added here */}
          <div className="text-center text-sm text-muted-foreground">
            More integrations coming soon...
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
