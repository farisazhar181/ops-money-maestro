import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate, idr, num, today } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Financial Reports | Loka Logistics ERP" },
      {
        name: "description",
        content: "Monthly profit and loss, receivable aging, and payable aging reports.",
      },
      { property: "og:title", content: "Financial Reports | Loka Logistics ERP" },
      {
        property: "og:description",
        content: "Financial reporting for PT. Loka Logistics Solution.",
      },
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

function ReportsPage() {
  const { canSeeExecutive, loading: rolesLoading } = useRoles();
  const currentYear = today().slice(0, 4);
  const [year, setYear] = useState(currentYear);
  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => String(Number(currentYear) - i)),
    [currentYear],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["reports", year],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const [monthly, ar, ap] = await Promise.all([
        supabase.rpc("report_monthly", { _from: `${year}-01-01`, _to: `${year}-12-31` }),
        supabase.rpc("report_aging", { _kind: "ar" }),
        supabase.rpc("report_aging", { _kind: "ap" }),
      ]);
      if (monthly.error) throw monthly.error;
      if (ar.error) throw ar.error;
      if (ap.error) throw ap.error;
      return { monthly: monthly.data ?? [], ar: ar.data ?? [], ap: ap.data ?? [] };
    },
  });

  const pnl = (data?.monthly ?? []).map((row) => {
    const revenue = num(row.revenue);
    const cost = num(row.cost);
    const overhead = num(row.overhead);
    return {
      month: row.month.slice(0, 7),
      revenue,
      cost,
      grossProfit: revenue - cost,
      overhead,
      netProfit: num(row.net_profit),
    };
  });
  const margin = (profit: number, revenue: number) =>
    revenue ? `${((profit / revenue) * 100).toFixed(1)}%` : "—";
  const arRows = data?.ar ?? [];
  const apRows = data?.ap ?? [];

  if (rolesLoading) return <p className="text-muted-foreground">Checking access…</p>;
  if (!canSeeExecutive) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" /> Restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Financial reports are available to Owner and Finance roles only.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Monthly performance and outstanding account aging
          </p>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32" aria-label="Report year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList className="grid w-full grid-cols-3 sm:w-fit">
          <TabsTrigger value="pnl">Monthly P&amp;L</TabsTrigger>
          <TabsTrigger value="ar">AR aging</TabsTrigger>
          <TabsTrigger value="ap">AP aging</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          <ReportCard
            title={`Monthly P&L · ${year}`}
            onExport={() =>
              downloadCsv(
                `monthly-pnl-${year}.csv`,
                [
                  "Month",
                  "Revenue",
                  "Cost",
                  "Gross Profit",
                  "Overhead",
                  "Net Profit (after overhead)",
                  "Net Margin %",
                ],
                pnl.map((row) => [
                  row.month,
                  row.revenue,
                  row.cost,
                  row.grossProfit,
                  row.overhead,
                  row.netProfit,
                  row.revenue ? ((row.netProfit / row.revenue) * 100).toFixed(1) : "",
                ]),
              )
            }
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Revenue = issued, non-void invoices by invoice date. Cost = non-void vendor bills by
              bill date. Pipeline estimates are not included.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                  <TableHead className="text-right">Overhead</TableHead>
                  <TableHead className="text-right">Net profit</TableHead>
                  <TableHead className="text-right">Net margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnl.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>
                      {new Date(`${row.month}-01T00:00:00`).toLocaleDateString("en-GB", {
                        month: "long",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">{idr(row.revenue)}</TableCell>
                    <TableCell className="text-right">{idr(row.cost)}</TableCell>
                    <TableCell className="text-right">{idr(row.grossProfit)}</TableCell>
                    <TableCell className="text-right">{idr(row.overhead)}</TableCell>
                    <TableCell className="text-right font-medium">{idr(row.netProfit)}</TableCell>
                    <TableCell className="text-right">
                      {margin(row.netProfit, row.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && pnl.length === 0 && <EmptyRow columns={7} />}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        <TabsContent value="ar">
          <ReportCard
            title="Accounts receivable aging"
            onExport={() =>
              downloadCsv(
                "ar-aging.csv",
                ["Invoice", "Customer", "Job", "Due Date", "Amount", "Received", "Balance", "Age"],
                arRows.map((row) => [
                  row.reference,
                  row.party,
                  row.job_sheet_no,
                  row.due_date,
                  row.amount,
                  row.paid,
                  row.balance,
                  row.bucket,
                ]),
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.reference}</TableCell>
                    <TableCell>{row.party ?? "-"}</TableCell>
                    <TableCell>{row.job_sheet_no ?? "-"}</TableCell>
                    <TableCell>{fmtDate(row.due_date)}</TableCell>
                    <TableCell>{row.bucket}</TableCell>
                    <TableCell className="text-right font-medium">{idr(row.balance)}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && arRows.length === 0 && <EmptyRow columns={6} />}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        <TabsContent value="ap">
          <ReportCard
            title="Accounts payable aging"
            onExport={() =>
              downloadCsv(
                "ap-aging.csv",
                [
                  "Vendor",
                  "Job",
                  "Description",
                  "Bill Date",
                  "Due Date",
                  "Invoice",
                  "Paid",
                  "Balance",
                  "Age",
                ],
                apRows.map((row) => [
                  row.party,
                  row.job_sheet_no,
                  row.reference,
                  row.doc_date,
                  row.due_date,
                  row.amount,
                  row.paid,
                  row.balance,
                  row.bucket,
                ]),
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.party ?? "-"}</TableCell>
                    <TableCell>{row.job_sheet_no ?? "-"}</TableCell>
                    <TableCell>{row.reference ?? "-"}</TableCell>
                    <TableCell>{fmtDate(row.due_date)}</TableCell>
                    <TableCell>{row.bucket}</TableCell>
                    <TableCell className="text-right font-medium">{idr(row.balance)}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && apRows.length === 0 && <EmptyRow columns={6} />}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportCard({
  title,
  onExport,
  children,
}: {
  title: string;
  onExport: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" onClick={onExport}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ columns }: { columns: number }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
        No records to display.
      </TableCell>
    </TableRow>
  );
}
