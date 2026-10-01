import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Truck,
  ReceiptText,
  Wallet,
  Banknote,
  ChartNoAxesCombined,
  Database,
  Settings,
  Coins,
  Landmark,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useRoles } from "@/hooks/use-auth";
import logoAsset from "@/assets/logo-logis.jpg.asset.json";

const nav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, exec: true },
  { title: "Job Sheets", url: "/jobs", icon: Truck },
  { title: "Receivables (AR)", url: "/receivables", icon: ReceiptText },
  { title: "Payables (AP)", url: "/payables", icon: Wallet },
  { title: "Cash Flow", url: "/payments", icon: Banknote },
];

const administration = [
  { title: "Master Data", url: "/master-data", icon: Database },
  { title: "User Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { canSeeExecutive, canManageUsers, canEditMasterData } = useRoles();

  const items = [
    ...nav.filter((i) => !i.exec || canSeeExecutive),
    ...(canSeeExecutive
      ? [
          { title: "Overhead Costs", url: "/overhead", icon: Coins },
          { title: "Investor Transactions", url: "/investors", icon: Landmark },
          { title: "Reports", url: "/reports", icon: ChartNoAxesCombined },
          { title: "Statistics", url: "/statistics", icon: LineChartIcon },
        ]
      : []),
  ];
  const administrationItems = administration.filter((item) =>
    item.url === "/settings" ? canManageUsers : canEditMasterData,
  );
  const isActive = (url: string) => path === url || path.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex h-16 items-center px-2 py-2">
            <img
              src={logoAsset.url}
              alt="LOGIS"
              className="h-auto max-h-11 w-full object-contain"
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {administrationItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {administrationItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
