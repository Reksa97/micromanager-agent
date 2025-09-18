"use client";

import { useEffect, useState } from "react";
import { miniApp, themeParams, viewport } from "@telegram-apps/sdk-react";
import { TelegramChatPanelEnhanced } from "@/features/telegram/components/telegram-chat-panel";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export function TelegramMiniAppAuthenticated() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    name: string;
    role: "user" | "admin";
  } | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        // Setup Mini App
        miniApp.ready();
        viewport.expand();

        // Apply theme
        const theme = themeParams.state();
        if (theme?.bg_color) {
          document.documentElement.style.setProperty(
            "--telegram-bg-color",
            theme.bg_color
          );
        }

        // Get user info from session
        const token = localStorage.getItem("telegram-token");
        if (token) {
          const response = await fetch("/api/auth/telegram", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
              setUser(data.user);
            }
          }
        }

        setIsReady(true);
      } catch (err) {
        console.error("Failed to initialize app:", err);
        setIsReady(true);
      }
    };

    initApp();
  }, []);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading Mini App...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-background">
      {/* Mobile-optimized header */}
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              TELEGRAM
            </Badge>
            <h1 className="text-base font-semibold">Micromanager</h1>
          </div>
          <div className="flex items-center gap-2">
            {user?.role === "admin" && (
              <Badge variant="outline" className="text-[10px]">
                ADMIN
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {user?.name || "User"}
            </span>
          </div>
        </div>
      </header>

      {/* Chat interface */}
      <div className="flex-1 overflow-hidden">
        <TelegramChatPanelEnhanced
          userId={user?.id || ""}
          isAdmin={user?.role === "admin"}
          userName={user?.name || "User"}
        />
      </div>
    </main>
  );
}
