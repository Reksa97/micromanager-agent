import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMongoClient } from "@/lib/db";
import { AdminDashboard } from "@/features/admin/components/admin-dashboard";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    console.log("No session found, redirecting to login.");
    redirect("/login");
  }

  if (!session?.user?.email) {
    console.log("User email not found in session, redirecting to login.");
    redirect("/login");
  }

  const client = await getMongoClient();
  const user = await client.db().collection("users").findOne({ email: session.user.email });
  const isAdmin = user?.tier === "admin";

  if (!isAdmin) {
    console.log("User is not admin, redirecting to home.");
    redirect("/");
  }

  return <AdminDashboard />;
}
