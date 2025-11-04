"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Users,
  Shield,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { UserProfile as User, UserTier } from "@/types/user";

import UserProfileCard from "./user-profile-card";
import UserContextViewer from "./user-context-viewer";
import UserAuditLogList from "./user-log-list";
import { AuditLogEntry, UserContext } from "./utils";

export function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<
    Record<string, { context: UserContext | null; logs: AuditLogEntry[] }>
  >({});

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/admin/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data.users);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateUser = async (userId: string, updates: Partial<User>) => {
    setUpdating(userId);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, updates }),
      });

      if (!response.ok) throw new Error("Failed to update user");

      toast.success("User updated successfully");
      await fetchUsers();
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error("Failed to update user");
    } finally {
      setUpdating(null);
    }
  };

  const resetDatabase = async () => {
    setResetting(true);
    try {
      const response = await fetch("/api/admin/reset-db", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to reset database");

      toast.success(data.message || "Database reset successfully");
      setShowResetDialog(false);
      setUsers([]);
      setTimeout(() => fetchUsers(), 1000);
    } catch (error) {
      console.error("Error resetting database:", error);
      toast.error(error instanceof Error ? error.message : "Failed to reset database");
    } finally {
      setResetting(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    try {
      const [contextRes, logsRes] = await Promise.all([
        fetch(`/api/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "get", format: "json" }),
        }),
        fetch(`/api/admin/users/${userId}/logs`, { credentials: "include" }),
      ]);

      const contextData = contextRes.ok ? await contextRes.json() : null;
      const logsData = logsRes.ok ? await logsRes.json() : { logs: [] };

      setUserData((prev) => ({
        ...prev,
        [userId]: {
          context: contextData ? JSON.parse(contextData.output || "{}") : null,
          logs: logsData.logs ?? [],
        },
      }));
    } catch (err) {
      console.error("Error fetching user details:", err);
      toast.error("Failed to fetch user details");
    }
  };

  const toggleExpand = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    if (!userData[userId]) await fetchUserDetails(userId);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter((u) => {
      const lastLogin = new Date(u.lastLogin);
      const daysSinceLogin =
        (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLogin < 7;
    }).length,
    paidUsers: users.filter((u) => u.tier === "paid").length,
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">System Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage users, tiers, and inspect user data
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeUsers} active this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Paid Users</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paidUsers}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.paidUsers / stats.totalUsers) * 100).toFixed(0)}% conversion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actions</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" onClick={fetchUsers} className="w-full">
              <RefreshCw className="mr-2 h-3 w-3" />
              Refresh Data
            </Button>
            {process.env.NODE_ENV !== "production" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowResetDialog(true)}
                className="w-full"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Reset Database
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>Manage user tiers and inspect data</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>User</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Last Login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const expanded = expandedUserId === user.id;
                const details = userData[user.id];

                return (
                  <>
                    <TableRow key={user.id}>
                      <TableCell className="w-8 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(user.id)}
                        >
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {user.email || `TG: ${user.telegramId}`}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.tier}
                          onValueChange={(value: UserTier) =>
                            updateUser(user.id, { tier: value })
                          }
                          disabled={updating === user.id}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(user.lastLogin).toLocaleDateString()}
                        </div>
                      </TableCell>
                    </TableRow>

                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <div className="border-t mt-2 pt-4 space-y-4">
                            <UserProfileCard user={user} />
                            <UserContextViewer
                              context={details?.context ?? null}
                              loading={!details}
                            />
                            <UserAuditLogList
                              logs={details?.logs ?? []}
                              loading={!details}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reset Database Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reset Database
            </DialogTitle>
            <DialogDescription>
              This will permanently delete ALL data from the database including:
              <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
                <li>All users and accounts</li>
                <li>All conversations and messages</li>
                <li>All usage logs and statistics</li>
                <li>All scheduled tasks and workplans</li>
                <li>All session data</li>
              </ul>
              <p className="mt-3 font-semibold text-destructive">
                This action cannot be undone!
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={resetDatabase}
              disabled={resetting}
            >
              {resetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Yes, Reset Database
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}