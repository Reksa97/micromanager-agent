"use client";

import { useState } from "react";
import { Session } from "next-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface LinkTelegramFormProps {
  session: Session;
}

export function LinkTelegramForm({ session }: LinkTelegramFormProps) {
  const [telegramId, setTelegramId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<{ name: string; telegramId: number } | null>(null);

  const handleVerifyTelegramId = async () => {
    if (!telegramId || isNaN(parseInt(telegramId))) {
      setError("Please enter a valid Telegram ID (numbers only)");
      return;
    }

    setLoading(true);
    setError("");
    setVerifiedUser(null);

    try {
      const response = await fetch("/api/auth/google/verify-telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          telegramId: parseInt(telegramId),
        }),
      });

      const data = await response.json();

      if (response.ok && data.user) {
        setVerifiedUser(data.user);
      } else {
        setError(data.error || "Telegram user not found in database");
      }
    } catch (err) {
      setError("Failed to verify Telegram ID. Please try again.");
      console.error("Verification error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAccounts = async () => {
    if (!verifiedUser) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/google/link-telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          telegramId: verifiedUser.telegramId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to link accounts");
      }
    } catch (err) {
      setError("Failed to link accounts. Please try again.");
      console.error("Linking error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <CardTitle>Successfully Linked!</CardTitle>
            </div>
            <CardDescription>
              Your Google account has been linked to your Telegram user
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm">
                <strong>Google:</strong> {session.user?.email}
              </p>
              <p className="text-sm">
                <strong>Telegram:</strong> {verifiedUser?.name}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              You can now close this page and return to the Telegram Mini App.
              Your micromanager can now access your Google Calendar!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Link Telegram to Google</CardTitle>
          <CardDescription>
            Connect your Google account ({session.user?.email}) to your Telegram user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <AlertCircle className="h-4 w-4" />
              <p>{error}</p>
            </div>
          )}

          {!verifiedUser ? (
            <>
              <div className="space-y-2">
                <label htmlFor="telegramId" className="text-sm font-medium">
                  Your Telegram ID
                </label>
                <Input
                  id="telegramId"
                  type="text"
                  placeholder="123456789"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Find your Telegram ID in the Mini App settings or by asking @userinfobot on Telegram
                </p>
              </div>

              <Button
                onClick={handleVerifyTelegramId}
                disabled={loading || !telegramId}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify Telegram ID"
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                <CheckCircle2 className="h-4 w-4" />
                <p>
                  Found Telegram user: <strong>{verifiedUser.name}</strong>
                </p>
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Ready to link:</p>
                <p className="text-sm">
                  <strong>Google:</strong> {session.user?.email}
                </p>
                <p className="text-sm">
                  <strong>Telegram:</strong> {verifiedUser.name} (ID: {verifiedUser.telegramId})
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setVerifiedUser(null);
                    setTelegramId("");
                  }}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleLinkAccounts}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    "Confirm & Link"
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
