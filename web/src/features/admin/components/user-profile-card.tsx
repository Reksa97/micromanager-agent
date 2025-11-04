import { UserProfile } from "@/types/user";

export default function UserProfileCard({ user }: { user: UserProfile }) {
  return (
    <div className="rounded-lg border p-4 bg-card shadow-sm">
      <h2 className="text-lg font-semibold mb-2">User Profile</h2>
      <div className="text-sm space-y-1">
        <div>ID: {user.id}</div>
        <div>Name: {user.name}</div>
        <div>Email: {user.email ?? "N/A"}</div>
        <div>Tier: {user.tier}</div>
        <div>Telegram: {user.telegramId ?? "N/A"}</div>
        <div>Created: {new Date(user.createdAt).toLocaleString()}</div>
        <div>Last Login: {new Date(user.lastLogin).toLocaleString()}</div>
      </div>
    </div>
  );
}