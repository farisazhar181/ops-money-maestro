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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idr, num, pct, fmtDate, isOverdue } from "@/lib/format";
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
    queryFn: async () => {
      const [jobs, ar, ap, tx] = await Promise.all([
        supabase.from("jobs").select("id, status, job_financials(estimated_selling)"),
        supabase
          .from("accounts_receivable")
          .select("id, invoice_no, amount, paid_amount, remaining_amount, due_date, status, customers(company_name)")
          .order("due_date", { ascending: true }),
        supabase
          .from("accounts_payable")
          .select(
            "id, invoice_amount, paid_amount, balance_remaining, due_date, status, subcontractors_vendors(vendor_name)",
          )
          .order("due_date", { ascending: true }),
        supabase.from("payment_transactions").select("amount, reference_type"),
      ]);
      if (jobs.error) throw jobs.error;
      if (ar.error) throw ar.error;
      if (ap.error) throw ap.error;
      if (tx.error) throw tx.error;
      return { jobs: jobs.data, ar: ar.data, ap: ap.data, tx: tx.data };
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

  const jobs = data?.jobs ?? [];
  const ar = data?.ar ?? [];
  const ap = data?.ap ?? [];
  const tx = data?.tx ?? [];

  const revenue = ar.reduce((s, r) => s + num(r.amount), 0);
  const arReceipts = ar.reduce((s, r) => s + num(r.paid_amount), 0);
  const arOutstanding = ar.reduce((s, r) => s + num(r.remaining_amount), 0);
  const payable = ap.reduce((s, r) => s + num(r.invoice_amount), 0);
  const apPayments = ap.reduce((s, r) => s + num(r.paid_amount), 0);
  const apOutstanding = ap.reduce((s, r) => s + num(r.balance_remaining), 0);
  const netProfit = revenue - payable;
  const ratio = revenue > 0 ? netProfit / revenue : 0;
  const assets = arOutstanding + arReceipts;
  const dar = assets > 0 ? payable / assets : 0;
  const cashIn = tx.filter((t) => t.reference_type === "AR_RECEIPT").reduce((s, t) => s + num(t.amount), 0);
  const cashOut = tx
    .filter((t) => t.reference_type !== "AR_RECEIPT")
    .reduce((s, t) => s + num(t.amount), 0);

  const overdueAr = ar.filter((r) => isOverdue(r.due_date, num(r.remaining_amount)));
  const upcomingAp = ap.filter((r) => num(r.balance_remaining) > 0).slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Executive Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {jobs.length} job sheets &middot; {jobs.filter((j) => j.status === "Closed").length} closed
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Total Sales Revenue (Accrual)" value={idr(revenue)} icon={TrendingUp} sub={`Pipeline value ${idr(jobs.reduce((s, j) => s + num(j.job_financials?.estimated_selling), 0))}`} />
        <Kpi
          label="Accounts Receivable"
          value={idr(arOutstanding)}
          sub={`Accrual ${idr(revenue)} · Received ${idr(arReceipts)}`}
          icon={ReceiptText}
          tone="warning"
        />
        <Kpi
          label="Accounts Payable"
          value={idr(apOutstanding)}
          sub={`Accrual ${idr(payable)} · Paid ${idr(apPayments)}`}
          icon={Wallet}
          tone="destructive"
        />
        <Kpi
          label="Net Profit (Pre-Overhead)"
          value={idr(netProfit)}
          sub={`Profitability ratio ${pct(ratio)}`}
          icon={PiggyBank}
          tone={netProfit >= 0 ? "success" : "destructive"}
        />
        <Kpi
          label="Debt-to-Asset Ratio"
          value={pct(dar)}
          sub={`Liabilities ${idr(payable)} vs assets ${idr(assets)}`}
          icon={Scale}
          tone={dar > 0.6 ? "destructive" : "success"}
        />
        <Kpi
          label="Net Cash Flow"
          value={idr(cashIn - cashOut)}
          sub={`In ${idr(cashIn)} · Out ${idr(cashOut)}`}
          icon={cashIn - cashOut >= 0 ? ArrowUpRight : ArrowDownRight}
          tone={cashIn - cashOut >= 0 ? "success" : "destructive"}
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
                <span>{pct(revenue > 0 ? arReceipts / revenue : 0)}</span>
              </div>
              <Progress value={revenue > 0 ? (arReceipts / revenue) * 100 : 0} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-muted-foreground">Vendor payments vs billed</span>
                <span>{pct(payable > 0 ? apPayments / payable : 0)}</span>
              </div>
              <Progress value={payable > 0 ? (apPayments / payable) * 100 : 0} />
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
                      <TableCell className="font-medium">{r.invoice_no}</TableCell>
                      <TableCell>{r.customers?.company_name ?? "-"}</TableCell>
                      <TableCell>{fmtDate(r.due_date)}</TableCell>
                      <TableCell className="text-right">{idr(r.remaining_amount)}</TableCell>
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
                      {r.subcontractors_vendors?.vendor_name ?? "-"}
                    </TableCell>
                    <TableCell>{fmtDate(r.due_date)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={isOverdue(r.due_date, num(r.balance_remaining)) ? "Overdue" : r.status}
                      />
                    </TableCell>
                    <TableCell className="text-right">{idr(r.balance_remaining)}</TableCell>
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
