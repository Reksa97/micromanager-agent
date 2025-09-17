import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-6 py-12">
      <Card className="w-full border border-border/70 bg-card/80 shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in with your operations workspace account to access the realtime agent dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <LoginForm />
          <p className="text-sm text-muted-foreground">
            Need an account? <Link href="/register" className="text-primary underline">Create one</Link>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
