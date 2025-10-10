"use client";

import { useEffect, useState } from "react";
import { miniApp, themeParams, viewport } from "@telegram-apps/sdk-react";
import { TelegramChatPanel } from "@/features/telegram/components/telegram-chat-panel";
import { LinkedAccountsDialog } from "@/features/telegram/components/linked-accounts-dialog";
import { FirstLoadExperience } from "@/features/telegram/components/first-load-experience";
import { Badge } from "@/components/ui/badge";
import { BuildInfo } from "@/components/build-info";
import { Loader2 } from "lucide-react";

export function TelegramMiniAppAuthenticated() {
  const [isReady, setIsReady] = useState(false);
  const [showFirstLoad, setShowFirstLoad] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    name: string;
    role: "user" | "admin";
    hasCompletedFirstLoad?: boolean;
  } | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        const isTelegramEnv =
          typeof window !== "undefined" &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Boolean((window as any).Telegram?.WebApp);

        if (isTelegramEnv) {
          try {
            miniApp.ready();
          } catch (error) {
            console.debug(
              "[Telegram Mini App] miniApp.ready unavailable",
              error
            );
          }
          try {
            viewport.expand();
          } catch (error) {
            console.debug(
              "[Telegram Mini App] viewport.expand unavailable",
              error
            );
          }
        }

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
              const profile = data.user;
              setUser({
                id: profile.id,
                name: profile.name,
                role: profile.tier === "admin" ? "admin" : "user",
                hasCompletedFirstLoad: profile.hasCompletedFirstLoad,
              });

              // Show first load experience if user hasn't seen it
              if (!profile.hasCompletedFirstLoad) {
                setShowFirstLoad(true);
              }
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

  const handleFirstLoadComplete = async () => {
    // Mark first load as complete
    const token = localStorage.getItem("telegram-token");
    if (token && user?.id) {
      try {
        // Mark first-load as complete in DB
        await fetch("/api/user/complete-first-load", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Trigger first-load greeting workflow (sends welcome message)
        console.log("[First Load] Triggering greeting workflow...");
        await fetch("/api/workflow/first-load-greeting", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setUser((prev) => prev ? { ...prev, hasCompletedFirstLoad: true } : null);
        setShowFirstLoad(false);
      } catch (error) {
        console.error("Failed to complete first load:", error);
        // Still hide the first load experience
        setShowFirstLoad(false);
      }
    }
  };

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

  // Show first load experience
  if (showFirstLoad) {
    return (
      <FirstLoadExperience
        userName={user?.name}
        onComplete={handleFirstLoadComplete}
      />
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
              {user?.name ?? "User"}
            </span>
            {user?.id && <LinkedAccountsDialog userId={user.id} />}
          </div>
        </div>
        {/* Build info in top corner */}
        <div className="mt-2">
          <BuildInfo />
        </div>
      </header>

      {/* Chat interface */}
      <div className="flex-1 overflow-hidden">
        <TelegramChatPanel
          userId={user?.id ?? ""}
          userName={user?.name ?? "User"}
        />
      </div>
    </main>
  );
}
