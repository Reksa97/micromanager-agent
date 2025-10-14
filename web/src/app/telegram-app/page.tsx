"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TelegramMiniAppAuthenticated } from "@/features/telegram/components/telegram-mini-app-authenticated";
import { Loader2 } from "lucide-react";

export default function TelegramAppPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      // Check for test_token in URL query params
      const searchParams = new URLSearchParams(window.location.search);
      const testToken = searchParams.get("test_token");

      if (testToken) {
        console.log("[Telegram App] Test token found in URL, storing...");
        localStorage.setItem("telegram-token", testToken);
        // Remove test_token from URL for cleaner experience
        window.history.replaceState({}, "", "/telegram-app");
      }

      const token = localStorage.getItem("telegram-token");

      if (!token) {
        console.log("[Telegram App] No token found, redirecting to /telegram");
        router.push("/telegram");
        return;
      }

      try {
        // Verify token with backend
        const response = await fetch("/api/auth/telegram", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authenticated) {
            console.log("[Telegram App] Token valid, user authenticated");
            setIsAuthenticated(true);
          } else {
            console.log("[Telegram App] Token invalid, redirecting to /telegram");
            localStorage.removeItem("telegram-token");
            router.push("/telegram");
          }
        } else {
          console.log("[Telegram App] Auth check failed, redirecting to /telegram");
          localStorage.removeItem("telegram-token");
          router.push("/telegram");
        }
      } catch (error) {
        console.error("[Telegram App] Auth check error:", error);
        router.push("/telegram");
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <TelegramMiniAppAuthenticated />;
}