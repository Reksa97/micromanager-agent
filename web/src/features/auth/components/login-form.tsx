"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultEmail = searchParams?.get("email") ?? "";
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!defaultEmail) return;
    setEmail((prev) => (prev ? prev : defaultEmail));
  }, [defaultEmail]);

  return (
    <div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const payloadEmail = email.trim();
            const result = await signIn("credentials", {
              email: payloadEmail,
              password: password.trim(),
              redirect: false,
            });
            if (result?.error) {
              toast.error("Invalid email or password");
              return;
            }
            router.push("/");
            router.refresh();
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div className="flex space-x-2">
          <Button type="submit" className="w-full gap-2" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Sign in
          </Button>
          <Button type="button" onClick={() => signIn("google")}>Sign in with Google</Button>
        </div>
      </form>
      
    </div>
  );
}
