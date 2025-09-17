import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/features/auth/components/register-form";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-6 py-12">
      <Card className="w-full border border-border/70 bg-card/80 shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Create your workspace</CardTitle>
          <CardDescription>
            Provision a Micromanager agent account backed by MongoDB and Auth.js credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RegisterForm />
          <p className="text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="text-primary underline">Sign in</Link>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
