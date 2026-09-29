import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  ReceiptText,
  Wallet,
  PiggyBank,
  Scale,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  Landmark,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idr, num, pct, fmtDate } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Executive Dashboard | Loka Logistics ERP" },
      {
        name: "description",
        content:
          "Revenue, receivables, payables, net profit and liability ratios for PT. Loka Logistics Solution.",
      },
      { property: "og:title", content: "Executive Dashboard | Loka Logistics ERP" },
      {
        property: "og:description",
        content: "Real-time logistics revenue, cash flow and profitability metrics.",
      },
    ],
  }),
  component: Dashboard,
});

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneClass = {
    default: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    destructive: "text-destructive bg-destructive/10",
  }[tone];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="font-display text-2xl font-semibold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { canSeeExecutive, loading: rolesLoading } = useRoles();

  const { data } = useQuery({
    queryKey: ["dashboard"],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const [summary, ar, ap] = await Promise.all([
        supabase.rpc("report_summary"),
        supabase.rpc("report_aging", { _kind: "ar" }),
        supabase.rpc("report_aging", { _kind: "ap" }),
      ]);
      if (summary.error) throw summary.error;
      if (ar.error) throw ar.error;
      if (ap.error) throw ap.error;
      return { summary: summary.data?.[0], ar: ar.data ?? [], ap: ap.data ?? [] };
    },
  });

  if (rolesLoading) return <p className="text-muted-foreground">Loading…</p>;

  if (!canSeeExecutive) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" /> Restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Executive financial metrics are available to Owner and Finance roles only. Use Job Sheets to
          manage your shipments.
        </CardContent>
      </Card>
    );
  }

  const m = data?.summary;
  const revenue = num(m?.revenue);
  const cost = num(m?.cost);
  const overhead = num(m?.overhead);
  const netProfit = num(m?.net_profit);
  const ratio = revenue > 0 ? netProfit / revenue : null;
  const ltr = m?.liabilities_to_revenue == null ? null : num(m.liabilities_to_revenue);
  const netOperating = num(m?.net_operating_cash);
  const netFinancing = num(m?.net_financing);
  const overdueAr = (data?.ar ?? []).filter((r) => num(r.days_overdue) > 0);
  const upcomingAp = (data?.ap ?? []).slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Executive Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {num(m?.jobs_total)} job sheets &middot; {num(m?.jobs_closed)} closed · figures exclude voided records
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Total Sales Revenue (Accrual)" value={idr(revenue)} icon={TrendingUp} sub="Non-void issued invoices" />
        <Kpi
          label="Accounts Receivable"
          value={idr(m?.ar_outstanding)}
          sub={`Invoiced ${idr(revenue)} · Received ${idr(m?.ar_received)}`}
          icon={ReceiptText}
          tone="warning"
        />
        <Kpi
          label="Accounts Payable"
          value={idr(m?.ap_outstanding)}
          sub={`Billed ${idr(cost)} · Paid ${idr(m?.ap_paid)}`}
          icon={Wallet}
          tone="destructive"
        />
        <Kpi
          label="Net Profit"
          value={idr(netProfit)}
          sub={`Revenue − cost ${idr(cost)} − overhead ${idr(overhead)} · margin ${pct(ratio)}`}
          icon={PiggyBank}
          tone={netProfit >= 0 ? "success" : "destructive"}
        />
        <Kpi
          label="Liabilities to Revenue Ratio"
          value={pct(ltr)}
          sub={`Outstanding payables ${idr(m?.ap_outstanding)} ÷ revenue ${idr(revenue)}`}
          icon={Scale}
          tone={ltr !== null && ltr > 0.6 ? "destructive" : "success"}
        />
        <Kpi
          label="Net Cash Flow (Operating)"
          value={idr(netOperating)}
          sub={`In ${idr(m?.op_cash_in)} · Out ${idr(m?.op_cash_out)}`}
          icon={netOperating >= 0 ? ArrowUpRight : ArrowDownRight}
          tone={netOperating >= 0 ? "success" : "destructive"}
        />
        <Kpi
          label="Financing (Investor)"
          value={idr(netFinancing)}
          sub={`Loans in ${idr(m?.financing_in)} · Repaid ${idr(m?.financing_out)} · not in profit or operating cash`}
          icon={Landmark}
        />
        <Kpi
          label="Pipeline Value"
          value={idr(m?.pipeline_value)}
          sub="Estimated selling of Pipeline and Active jobs · not revenue"
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collection progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-muted-foreground">Receipts vs invoiced</span>
                <span>{pct(revenue > 0 ? num(m?.ar_received) / revenue : null)}</span>
              </div>
              <Progress value={revenue > 0 ? (num(m?.ar_received) / revenue) * 100 : 0} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-muted-foreground">Vendor payments vs billed</span>
                <span>{pct(cost > 0 ? num(m?.ap_paid) / cost : null)}</span>
              </div>
              <Progress value={cost > 0 ? (num(m?.ap_paid) / cost) * 100 : 0} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue receivables ({overdueAr.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {overdueAr.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overdue invoices. Nice work.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueAr.slice(0, 6).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.reference}</TableCell>
                      <TableCell>{r.party ?? "-"}</TableCell>
                      <TableCell>{fmtDate(r.due_date)}</TableCell>
                      <TableCell className="text-right">{idr(r.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule of payables</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingAp.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding vendor bills.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingAp.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.party ?? "-"}
                    </TableCell>
                    <TableCell>{fmtDate(r.due_date)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={num(r.days_overdue) > 0 ? "Overdue" : r.bucket}
                      />
                    </TableCell>
                    <TableCell className="text-right">{idr(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
