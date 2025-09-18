import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminDashboard } from "@/features/admin/components/admin-dashboard";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session?.user?.tier !== "admin") {
    redirect("/");
  }

  return <AdminDashboard />;
}
