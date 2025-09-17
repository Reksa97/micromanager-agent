"use client";

import { useEffect, useState } from "react";
import { init, initData, miniApp, themeParams, viewport } from "@telegram-apps/sdk-react";
import type { User } from "@telegram-apps/types";
import { ChatPanel } from "@/features/chat/components/chat-panel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertCircle } from "lucide-react";

interface TelegramMiniAppProps {
  userId: string;
}

export function TelegramMiniApp({ userId }: TelegramMiniAppProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [telegramUser, setTelegramUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initTelegram = async () => {
      try {
        init();

        const userData = initData.user() ?? null;
        setTelegramUser(userData);

        miniApp.ready();
        viewport.expand();

        const theme = themeParams.state();
        if (theme?.bg_color) {
          document.documentElement.style.setProperty("--telegram-bg-color", theme.bg_color);
        }

        if (userData?.id) {
          await fetch("/api/telegram/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              telegramId: userData.id,
              userId,
              firstName: userData.first_name,
              lastName: userData.last_name,
              username: userData.username,
            }),
          });
        }

        setIsInitialized(true);
      } catch (err) {
        console.error("Failed to initialize Telegram Mini App:", err);
        setError("This page must be opened from within Telegram");
        setIsInitialized(true);
      }
    };

    initTelegram();
  }, [userId]);

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Initializing Telegram Mini App...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="max-w-md p-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="border-b bg-card/80 p-4 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="uppercase tracking-[0.35em] text-[10px]">
                Telegram
              </Badge>
              <h1 className="text-lg font-semibold">Micromanager Agent</h1>
            </div>
            {telegramUser && (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {telegramUser.first_name?.[0] || telegramUser.username?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {telegramUser.first_name} {telegramUser.last_name ?? ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ChatPanel telegramMode={true} />
      </div>
    </main>
  );
}
