import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TelegramMiniApp } from "@/features/telegram/components/telegram-mini-app";

export default async function TelegramPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return <TelegramMiniApp userId={session.user.id || session.user.email || ""} />;
}