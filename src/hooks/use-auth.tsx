import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "finance" | "operations";

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
    queryKey: ["roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });

  const roles = query.data ?? [];
  return {
    roles,
    loading: query.isLoading,
    isAdmin: roles.includes("admin"),
    isFinance: roles.includes("finance"),
    isOperations: roles.includes("operations"),
    canSeeExecutive: roles.includes("admin") || roles.includes("finance"),
    canEditJobs: roles.includes("admin") || roles.includes("operations"),
    canEditFinance: roles.includes("admin") || roles.includes("finance"),
    primaryRole: (roles.includes("admin") ? "admin" : (roles[0] ?? "operations")) as AppRole,
  };
}
