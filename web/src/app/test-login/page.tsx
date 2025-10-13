"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Smartphone, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/**
 * Test Login Page - Bridge between next-auth and Telegram Mini App
 *
 * Allows testing Telegram Mini App without actual Telegram authentication.
 * Uses real next-auth credentials (email + bcrypt password) and generates
 * JWT token for Telegram mini app access.
 *
 * Flow:
 * 1. User enters email/password (real credentials)
 * 2. Authenticates via next-auth
 * 3. Converts session to Telegram-compatible JWT
 * 4. Redirects to /telegram-app
 */
export default function TestLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        // Step 1: Authenticate with next-auth
        const result = await signIn("credentials", {
          email: email.trim(),
          password: password.trim(),
          redirect: false,
        });

        if (result?.error) {
          setError("Invalid email or password");
          toast.error("Invalid email or password");
          return;
        }

        // Step 2: Convert session to Telegram JWT
        const response = await fetch("/api/dev/test-login/convert-session", {
          method: "POST",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to convert session");
        }

        const data = await response.json();

        if (data.token) {
          // Step 3: Store token for Telegram mini app
          localStorage.setItem("telegram-token", data.token);

          // Step 4: Redirect to telegram-app
          router.push("/telegram-app");
        } else {
          throw new Error("No token received");
        }
      } catch (err) {
        console.error("[Test Login] Error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Authentication failed";
        setError(errorMessage);
        toast.error(errorMessage);
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center space-y-3">
          <div className="rounded-full bg-primary/10 p-3">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Test Telegram Mini App</h1>
          <p className="text-center text-sm text-muted-foreground">
            Sign in with your account to test the Telegram Mini App interface
          </p>
          <Badge variant="outline" className="text-xs">
            Uses Real Authentication
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing In...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Sign In & Test Mini App
              </>
            )}
          </Button>

          <div className="space-y-2 text-center">
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <a
                href="/register"
                className="text-primary underline-offset-4 hover:underline"
              >
                Create one
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              For production Telegram, use{" "}
              <a
                href="/telegram"
                className="text-primary underline-offset-4 hover:underline"
              >
                Telegram authentication
              </a>
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
