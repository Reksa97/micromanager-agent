import { auth, signIn } from "@/auth";
import { LinkTelegramForm } from "@/features/telegram/components/link-telegram-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function LinkTelegramPage() {
  const session = await auth();

  // If not authenticated, show sign-in prompt
  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link Telegram Account</CardTitle>
            <CardDescription>
              Sign in with Google to link your Telegram account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/link-telegram" });
              }}
            >
              <Button type="submit" className="w-full">
                Sign in with Google
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <LinkTelegramForm session={session} />;
}
