import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "finance" | "operations";
export type AccountStatus = "pending" | "active" | "deactivated";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function useRoles() {
  const { user } = useAuthUser();
  const query = useQuery({
    queryKey: ["access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { roles: [] as AppRole[], status: "pending" as AccountStatus };
      const [rolesResult, profileResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("status").eq("id", user.id).maybeSingle(),
      ]);
      if (rolesResult.error) throw rolesResult.error;
      if (profileResult.error) throw profileResult.error;
      return {
        roles: (rolesResult.data ?? []).map((r) => r.role as AppRole),
        status: (profileResult.data?.status ?? "pending") as AccountStatus,
      };
    },
  });

  const roles = query.data?.roles ?? [];
  const status = query.data?.status ?? "pending";
  return {
    roles,
    status,
    loading: query.isLoading,
    isActive: status === "active" && roles.length > 0,
    isPending: status === "pending" || (status === "active" && roles.length === 0),
    isDeactivated: status === "deactivated",
    isOwner: roles.includes("owner"),
    isFinance: roles.includes("finance"),
    isOperations: roles.includes("operations"),
    canSeeExecutive: roles.includes("owner") || roles.includes("finance"),
    canEditJobs: roles.includes("owner") || roles.includes("operations"),
    canEditFinance: roles.includes("owner") || roles.includes("finance"),
    canManageUsers: roles.includes("owner") || roles.includes("finance"),
    primaryRole: roles.includes("owner") ? "owner" : roles[0],
  };
}
