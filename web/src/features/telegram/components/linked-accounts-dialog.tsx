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
import { Settings, Link2, CheckCircle2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LinkedAccount {
  provider: string;
  email?: string;
  connected: boolean;
  scopes?: string;
}

interface LinkedAccountsDialogProps {
  userId: string;
}

export function LinkedAccountsDialog({}: LinkedAccountsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);

  const fetchLinkedAccounts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("telegram-token");
      const response = await fetch(`/api/user/linked-accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error("Failed to fetch linked accounts:", error);
    } finally {
      setLoading(false);
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
