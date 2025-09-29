"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  init,
  initData,
  themeParams,
  viewport,
} from "@telegram-apps/sdk-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Loader2,
  CheckCircle,
  Code,
  Eye,
  EyeOff,
} from "lucide-react";

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface TelegramMetadata {
  initData?: string;
  user?: TelegramUser;
  chat?: Record<string, unknown>;
  startParam?: string;
  authDate?: number;
  hash?: string;
  queryId?: string;
  chatType?: string;
  chatInstance?: string;
  canSendAfter?: number;
  platform?: string;
  version?: string;
  themeParams?: Record<string, unknown>;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  headerColor?: string;
  backgroundColor?: string;
  bottomBarColor?: string;
  isClosingConfirmationEnabled?: boolean;
  isVerticalSwipesEnabled?: boolean;
  mock?: boolean;
}

export default function TelegramLoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<
    "loading" | "authenticating" | "success" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [metadata, setMetadata] = useState<TelegramMetadata>({});
  const [showRawData, setShowRawData] = useState(false);

  useEffect(() => {
    const authenticateWithTelegram = async () => {
      console.log("[Telegram Login] Starting authentication process");

      const searchParams = new URLSearchParams(window.location.search);
      const mockSecretParam =
        searchParams.get("mock_secret") ?? searchParams.get("mockSecret");
      const mockUserIdParam =
        searchParams.get("mock_user_id") ?? searchParams.get("mockUserId");
      const isMockMode = Boolean(mockSecretParam);

      // Block mock mode completely in production
      if (isMockMode && process.env.NODE_ENV === "production") {
        console.error("[Telegram Login] Mock mode is not allowed in production");
        setErrorMessage("Mock authentication is disabled in production");
        setStatus("error");
        return;
      }

      const parseOptionalNumber = (value: string | null | undefined) => {
        if (!value) return undefined;
        const parsed = Number(value);
        return Number.isNaN(parsed) ? undefined : parsed;
      };

      // Only allow mock mode in development
      if (isMockMode && process.env.NODE_ENV === "development") {
        console.log(
          "[Telegram Login] Mock mode enabled via query parameters (DEV ONLY)"
        );

        const parsedId = parseOptionalNumber(mockUserIdParam) ?? 999001;
        if (!Number.isFinite(parsedId)) {
          setErrorMessage(
            "Invalid mock user id supplied in query string."
          );
          setStatus("error");
          return;
        }

        const mockMetadata: TelegramMetadata = {
          mock: true,
          user: {
            id: parsedId,
            first_name: "Mock",
            username: `mock_${parsedId}`,
          },
        };

        setMetadata(mockMetadata);
        setStatus("authenticating");

        try {
          const response = await fetch("/api/auth/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mockSecret: mockSecretParam,
              mockUser: {
                id: parsedId,
                first_name: "Mock",
                username: `mock_${parsedId}`,
                tier: "paid",
              },
              metadata: mockMetadata,
            }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(
              (data as { error?: string } | null)?.error ??
                "Mock authentication failed"
            );
          }

          const result = await response.json();
          if (result?.token) {
            localStorage.setItem("telegram-token", result.token);
          }

          setStatus("success");
          setTimeout(() => {
            router.push("/telegram-app");
          }, 800);
        } catch (error) {
          console.error("[Telegram Login] Mock authentication error:", error);
          setErrorMessage(
            error instanceof Error ? error.message : "Mock authentication failed"
          );
          setStatus("error");
        }

        return;
      }

      try {
        console.log("[Telegram Login] Window location:", window.location.href);
        console.log("[Telegram Login] User Agent:", navigator.userAgent);
        console.log("[Telegram Login] Platform:", navigator.platform);

        console.log("[Telegram Login] Initializing Telegram SDK...");

        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const tgWebAppData = params.get("tgWebAppData");

        console.log("[Telegram Login] Hash params:", hash);
        console.log("[Telegram Login] tgWebAppData from URL:", tgWebAppData);

        init();

        const collectedMetadata: TelegramMetadata = {};

        try {
          let rawInitData = initData.raw();

          if (!rawInitData && tgWebAppData) {
            rawInitData = decodeURIComponent(tgWebAppData);
            console.log("[Telegram Login] Using init data from URL hash");
          }

          collectedMetadata.initData = rawInitData;
          console.log("[Telegram Login] Raw init data:", rawInitData);

          if (rawInitData) {
            const urlParams = new URLSearchParams(rawInitData);

            // Try to parse user data
            const userParam = urlParams.get("user");
            if (userParam) {
              try {
                collectedMetadata.user = JSON.parse(userParam);
                console.log(
                  "[Telegram Login] User data:",
                  collectedMetadata.user
                );
              } catch (e) {
                console.error("[Telegram Login] Failed to parse user data:", e);
              }
            }

            // Get other parameters
            collectedMetadata.queryId = urlParams.get("query_id") || undefined;
            collectedMetadata.authDate = urlParams.get("auth_date")
              ? parseInt(urlParams.get("auth_date")!)
              : undefined;
            collectedMetadata.hash = urlParams.get("hash") || undefined;
            collectedMetadata.startParam =
              urlParams.get("start_param") || undefined;
            collectedMetadata.chatType =
              urlParams.get("chat_type") || undefined;
            collectedMetadata.chatInstance =
              urlParams.get("chat_instance") || undefined;

            console.log("[Telegram Login] Parsed parameters:", {
              queryId: collectedMetadata.queryId,
              authDate: collectedMetadata.authDate,
              hash: collectedMetadata.hash,
              startParam: collectedMetadata.startParam,
              chatType: collectedMetadata.chatType,
              chatInstance: collectedMetadata.chatInstance,
            });
          }

          // Get theme params
          const theme = themeParams.state();
          if (theme) {
            collectedMetadata.themeParams = theme;
            collectedMetadata.backgroundColor = theme.bg_color;
            collectedMetadata.headerColor = theme.header_bg_color;
            collectedMetadata.bottomBarColor = theme.bottom_bar_bg_color;
            console.log("[Telegram Login] Theme params:", theme);
          }

          // Get viewport info
          try {
            collectedMetadata.viewportHeight = viewport.height();
            collectedMetadata.viewportStableHeight = viewport.stableHeight();
            collectedMetadata.isExpanded = viewport.isExpanded();
            console.log("[Telegram Login] Viewport info:", {
              height: collectedMetadata.viewportHeight,
              stableHeight: collectedMetadata.viewportStableHeight,
              isExpanded: collectedMetadata.isExpanded,
            });
          } catch (e) {
            console.log("[Telegram Login] Could not get viewport info:", e);
          }

          // Get mini app info
          try {
            // Note: miniApp properties access may vary by SDK version
            // Collecting what's available
            console.log("[Telegram Login] MiniApp object available");
          } catch (e) {
            console.log("[Telegram Login] Could not get mini app info:", e);
          }
        } catch (e) {
          console.error("[Telegram Login] Error collecting metadata:", e);
        }

        setMetadata(collectedMetadata);

        if (!collectedMetadata.initData) {
          console.error("[Telegram Login] No init data available");

          // Check if we're in a Telegram context
          const isTelegram =
            window.location.hash.includes("tgWebAppData") ||
            window.location.search.includes("tgWebAppData") ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).Telegram?.WebApp;

          if (isTelegram) {
            setErrorMessage(
              "Failed to retrieve Telegram authentication data. Please try reopening the app."
            );
          } else {
            setErrorMessage("This page must be opened from within Telegram");
          }
          setStatus("error");
          return;
        }

        setStatus("authenticating");
        console.log(
          "[Telegram Login] Sending authentication request to backend..."
        );

        // Authenticate with backend
        const response = await fetch(`${process.env.APP_URL}/api/auth/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData: collectedMetadata.initData,
            metadata: collectedMetadata,
          }),
        });

        console.log(
          "[Telegram Login] Backend response status:",
          response.status
        );

        if (!response.ok) {
          const error = await response.json();
          console.error("[Telegram Login] Backend error response:", error);
          throw new Error(error.error || "Authentication failed");
        }

        const result = await response.json();
        console.log("[Telegram Login] Authentication successful:", {
          userId: result.user?.id,
          tier: result.user?.tier,
          hasToken: !!result.token,
        });

        // Store token
        if (result.token) {
          localStorage.setItem("telegram-token", result.token);
          console.log("[Telegram Login] Token stored in localStorage");
        }

        setStatus("success");

        // Redirect to telegram app, preserving the Telegram context
        console.log(
          "[Telegram Login] Redirecting to /telegram-app in 1 second..."
        );
        setTimeout(() => {
          // Preserve the hash to maintain Telegram context
          const currentHash = window.location.hash;
          router.push(`/telegram-app${currentHash}`);
        }, 1000);
      } catch (error) {
        console.error("[Telegram Login] Authentication error:", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Authentication failed"
        );
        setStatus("error");
      }
    };

    authenticateWithTelegram();
  }, [router]);

  // Helper to format metadata for display
  const formatMetadataForDisplay = () => {
    return JSON.stringify(metadata, null, 2);
  };

  // Show different UI based on status
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-primary/10 p-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Connecting to Telegram</h2>
            <p className="text-center text-sm text-muted-foreground">
              Initializing Telegram authentication...
            </p>
            {metadata.platform && (
              <Badge variant="outline" className="text-xs">
                Platform: {metadata.platform}
              </Badge>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (status === "authenticating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-primary/10 p-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Authenticating</h2>
            <p className="text-center text-sm text-muted-foreground">
              Verifying your Telegram credentials...
            </p>
            {metadata.user && (
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {metadata.user.first_name} {metadata.user.last_name}
                </p>
                {metadata.user.username && (
                  <p className="text-xs text-muted-foreground">
                    @{metadata.user.username}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-green-500/10 p-3">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold">Success!</h2>
            <p className="text-center text-sm text-muted-foreground">
              Redirecting to Telegram Mini App...
            </p>
            {metadata.user && (
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  Welcome, {metadata.user.first_name}!
                </p>
                <Badge variant="secondary" className="text-xs">
                  ID: {metadata.user.id}
                </Badge>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-2xl p-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Authentication Failed</h2>
          <p className="text-center text-sm text-muted-foreground">
            {errorMessage}
          </p>

          {/* Debug information toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRawData(!showRawData)}
            className="flex items-center gap-2"
          >
            {showRawData ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {showRawData ? "Hide" : "Show"} Debug Info
          </Button>

          {/* Debug metadata display */}
          {showRawData && (
            <div className="w-full space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Collected Metadata
                  </span>
                </div>
                <pre className="overflow-auto text-xs">
                  {formatMetadataForDisplay()}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-muted p-2">
                  <strong>User Agent:</strong>
                  <div className="mt-1 break-all text-muted-foreground">
                    {navigator.userAgent}
                  </div>
                </div>
                <div className="rounded bg-muted p-2">
                  <strong>Platform:</strong>
                  <div className="mt-1 text-muted-foreground">
                    {navigator.platform}
                  </div>
                </div>
                <div className="rounded bg-muted p-2">
                  <strong>Location:</strong>
                  <div className="mt-1 break-all text-muted-foreground">
                    {window.location.href}
                  </div>
                </div>
                <div className="rounded bg-muted p-2">
                  <strong>Has Init Data:</strong>
                  <div className="mt-1 text-muted-foreground">
                    {metadata.initData ? "Yes" : "No"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {errorMessage.includes("Telegram") ? (
            <div className="mt-4 space-y-3 text-center">
              <Badge variant="secondary">Open from Telegram Required</Badge>
              <p className="text-xs text-muted-foreground">
                This login method only works when opened from within the
                Telegram app.
              </p>
              <Button
                variant="outline"
                onClick={() => router.push("/login")}
                className="mt-4"
              >
                Use Regular Login
              </Button>
            </div>
          ) : (
            <Button onClick={() => window.location.reload()} className="mt-4">
              Try Again
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
