import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Clock3, LogOut, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { roleLabel, useAuthUser, useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const { primaryRole, isActive, isPending, isDeactivated, loading } = useRoles();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking access…
      </div>
    );

  if (!isActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
            {isDeactivated ? <ShieldX className="h-6 w-6" /> : <Clock3 className="h-6 w-6" />}
          </div>
          <h1 className="font-display text-2xl font-semibold">
            {isDeactivated ? "Access deactivated" : "Waiting for access"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isDeactivated
              ? "Your account no longer has access. Contact a Management or Finance user if this is unexpected."
              : "Your account is ready. A Management or Finance user must assign your role before you can continue."}
          </p>
          <Button className="mt-6" variant="outline" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
          {isPending && (
            <p className="mt-3 text-xs text-muted-foreground">
              You can safely return after your role is assigned.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-card/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
              {primaryRole && (
                <Badge variant="secondary" className="capitalize">
                  {roleLabel(primaryRole)}
                </Badge>
              )}
              <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
