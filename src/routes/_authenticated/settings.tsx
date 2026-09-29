import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { useAuthUser, useRoles, type AppRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "User Settings | Loka Logistics ERP" },
      {
        name: "description",
        content: "Manage staff accounts and assign Owner, Finance or Operations roles.",
      },
      { property: "og:title", content: "User Settings | Loka Logistics ERP" },
      {
        property: "og:description",
        content: "Role-based access management for Loka Logistics staff.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { isOwner, isFinance, canManageUsers, loading } = useRoles();
  const { user } = useAuthUser();

  const { data } = useQuery({
    queryKey: ["users-roles"],
    enabled: canManageUsers,
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      return (profiles.data ?? []).map((p) => ({
        ...p,
        role: (roles.data ?? []).find((r) => r.user_id === p.id)?.role ?? null,
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("assign_user_role", { _user_id: userId, _role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
      qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("deactivate_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User access deactivated");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  if (!canManageUsers) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" /> Restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Only Owner and Finance users can manage staff access.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">User Settings</h1>
        <p className="text-sm text-muted-foreground">
          Activate pending staff or revoke access immediately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff accounts ({data?.length ?? 0})</CardTitle>
          <CardDescription>
            Owner sees everything · Finance handles financial work · Operations manages job sheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Current</TableHead>
                <TableHead className="w-48">Role</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name ?? "-"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{fmtDate(u.created_at)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={u.status === "deactivated" ? "destructive" : "secondary"}
                      className="capitalize"
                    >
                      {u.status === "active" ? (u.role ?? "pending") : u.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role ?? ""}
                      onValueChange={(v) => setRole.mutate({ userId: u.id, role: v as AppRole })}
                      disabled={u.id === user?.id || u.status === "deactivated"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="operations">Operations</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== user?.id &&
                      u.status !== "deactivated" &&
                      !(isFinance && u.role === "owner") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Deactivate user"
                          onClick={() => deactivate.mutate(u.id)}
                          disabled={deactivate.isPending}
                        >
                          <UserX className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
