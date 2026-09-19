import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysUntil, fmtDate, idr, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Financial Reports | Loka Logistics ERP" },
      { name: "description", content: "Monthly profit and loss, receivable aging, and payable aging reports." },
      { property: "og:title", content: "Financial Reports | Loka Logistics ERP" },
      { property: "og:description", content: "Financial reporting for PT. Loka Logistics Solution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

type CsvValue = string | number | null | undefined;

function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  const quote = (value: CsvValue) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function agingBucket(days: number) {
  if (days >= 0) return "Current";
  const overdue = Math.abs(days);
  if (overdue <= 30) return "1–30 days";
  if (overdue <= 60) return "31–60 days";
  if (overdue <= 90) return "61–90 days";
  return "90+ days";
}

function ReportsPage() {
  const { canSeeExecutive, loading: rolesLoading } = useRoles();
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const [financials, ar, ap] = await Promise.all([
        supabase
          .from("job_financials")
          .select("job_id, estimated_selling, actual_selling, estimated_buying, actual_buying, jobs(job_sheet_no, order_date)"),
        supabase
          .from("accounts_receivable")
          .select("invoice_no, invoice_date, due_date, amount, paid_amount, remaining_amount, status, customers(company_name), jobs(job_sheet_no)")
          .order("due_date"),
        supabase
          .from("accounts_payable")
          .select("item_cost_description, due_date, invoice_amount, paid_amount, balance_remaining, status, subcontractors_vendors(vendor_name), jobs(job_sheet_no, order_date)")
          .order("due_date"),
      ]);
      if (financials.error) throw financials.error;
      if (ar.error) throw ar.error;
      if (ap.error) throw ap.error;
      return { financials: financials.data, ar: ar.data, ap: ap.data };
    },
  });

  const years = useMemo(() => {
    const found = new Set<string>([String(new Date().getFullYear())]);
    data?.financials.forEach((row) => row.jobs?.order_date && found.add(row.jobs.order_date.slice(0, 4)));
    data?.ar.forEach((row) => found.add(row.invoice_date.slice(0, 4)));
    data?.ap.forEach((row) => row.jobs?.order_date && found.add(row.jobs.order_date.slice(0, 4)));
    return [...found].sort().reverse();
  }, [data]);

  const pnl = useMemo(() => {
    const months = new Map<string, { revenue: number; cost: number }>();
    data?.financials.forEach((row) => {
      const date = row.jobs?.order_date;
      if (!date || date.slice(0, 4) !== year) return;
      const key = date.slice(0, 7);
      const current = months.get(key) ?? { revenue: 0, cost: 0 };
      current.revenue += num(row.actual_selling) || num(row.estimated_selling);
      current.cost += num(row.actual_buying) || num(row.estimated_buying);
      months.set(key, current);
    });
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, ...values, profit: values.revenue - values.cost }));
  }, [data, year]);

  const arRows = (data?.ar ?? []).filter((row) => num(row.remaining_amount) > 0);
  const apRows = (data?.ap ?? []).filter((row) => num(row.balance_remaining) > 0);

  if (rolesLoading) return <p className="text-muted-foreground">Checking access…</p>;
  if (!canSeeExecutive) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-warning" /> Restricted</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Financial reports are available to Owner and Finance roles only.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Monthly performance and outstanding account aging</p>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32" aria-label="Report year"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList className="grid w-full grid-cols-3 sm:w-fit">
          <TabsTrigger value="pnl">Monthly P&amp;L</TabsTrigger>
          <TabsTrigger value="ar">AR aging</TabsTrigger>
          <TabsTrigger value="ap">AP aging</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          <ReportCard title={`Monthly P&L · ${year}`} onExport={() => downloadCsv(`monthly-pnl-${year}.csv`, ["Month", "Revenue", "Cost", "Profit", "Margin %"], pnl.map((row) => [row.month, row.revenue, row.cost, row.profit, row.revenue ? ((row.profit / row.revenue) * 100).toFixed(1) : "0.0"]))}>
            <Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader><TableBody>
              {pnl.map((row) => <TableRow key={row.month}><TableCell>{new Date(`${row.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</TableCell><TableCell className="text-right">{idr(row.revenue)}</TableCell><TableCell className="text-right">{idr(row.cost)}</TableCell><TableCell className="text-right font-medium">{idr(row.profit)}</TableCell><TableCell className="text-right">{row.revenue ? `${((row.profit / row.revenue) * 100).toFixed(1)}%` : "0.0%"}</TableCell></TableRow>)}
              {!isLoading && pnl.length === 0 && <EmptyRow columns={5} />}
            </TableBody></Table>
          </ReportCard>
        </TabsContent>

        <TabsContent value="ar">
          <ReportCard title="Accounts receivable aging" onExport={() => downloadCsv("ar-aging.csv", ["Invoice", "Customer", "Job", "Due Date", "Amount", "Received", "Balance", "Age"], arRows.map((row) => [row.invoice_no, row.customers?.company_name, row.jobs?.job_sheet_no, row.due_date, row.amount, row.paid_amount, row.remaining_amount, agingBucket(daysUntil(row.due_date))]))}>
            <Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Job</TableHead><TableHead>Due date</TableHead><TableHead>Age</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>
              {arRows.map((row) => <TableRow key={row.invoice_no}><TableCell className="font-medium">{row.invoice_no}</TableCell><TableCell>{row.customers?.company_name ?? "-"}</TableCell><TableCell>{row.jobs?.job_sheet_no ?? "-"}</TableCell><TableCell>{fmtDate(row.due_date)}</TableCell><TableCell>{agingBucket(daysUntil(row.due_date))}</TableCell><TableCell className="text-right font-medium">{idr(row.remaining_amount)}</TableCell></TableRow>)}
              {!isLoading && arRows.length === 0 && <EmptyRow columns={6} />}
            </TableBody></Table>
          </ReportCard>
        </TabsContent>

        <TabsContent value="ap">
          <ReportCard title="Accounts payable aging" onExport={() => downloadCsv("ap-aging.csv", ["Vendor", "Job", "Description", "Due Date", "Invoice", "Paid", "Balance", "Age"], apRows.map((row) => [row.subcontractors_vendors?.vendor_name, row.jobs?.job_sheet_no, row.item_cost_description, row.due_date, row.invoice_amount, row.paid_amount, row.balance_remaining, agingBucket(daysUntil(row.due_date))]))}>
            <Table><TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Job</TableHead><TableHead>Description</TableHead><TableHead>Due date</TableHead><TableHead>Age</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>
              {apRows.map((row, index) => <TableRow key={`${row.jobs?.job_sheet_no}-${index}`}><TableCell className="font-medium">{row.subcontractors_vendors?.vendor_name ?? "-"}</TableCell><TableCell>{row.jobs?.job_sheet_no ?? "-"}</TableCell><TableCell>{row.item_cost_description ?? "-"}</TableCell><TableCell>{fmtDate(row.due_date)}</TableCell><TableCell>{agingBucket(daysUntil(row.due_date))}</TableCell><TableCell className="text-right font-medium">{idr(row.balance_remaining)}</TableCell></TableRow>)}
              {!isLoading && apRows.length === 0 && <EmptyRow columns={6} />}
            </TableBody></Table>
          </ReportCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportCard({ title, onExport, children }: { title: string; onExport: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ columns }: { columns: number }) {
  return <TableRow><TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">No records to display.</TableCell></TableRow>;
}