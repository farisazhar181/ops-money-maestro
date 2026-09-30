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
      const [monthly, ar, ap, summary] = await Promise.all([
        supabase.rpc("report_monthly", { _from: `${year}-01-01`, _to: `${year}-12-31` }),
        supabase.rpc("report_aging", { _kind: "ar" }),
        supabase.rpc("report_aging", { _kind: "ap" }),
        supabase.rpc("report_summary"),
      ]);
      if (monthly.error) throw monthly.error;
      if (ar.error) throw ar.error;
      if (ap.error) throw ap.error;
      if (summary.error) throw summary.error;
      return {
        monthly: monthly.data ?? [],
        ar: ar.data ?? [],
        ap: ap.data ?? [],
        summary: summary.data?.[0],
      };
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
      opIn: num(row.op_cash_in),
      opOut: num(row.op_cash_out),
      finIn: num(row.financing_in),
      finOut: num(row.financing_out),
    };
  });
  const s = data?.summary;
  const npm = s && num(s.revenue) > 0 ? num(s.net_profit) / num(s.revenue) : null;
  const ltr = s?.liabilities_to_revenue == null ? null : num(s.liabilities_to_revenue);
  const liq = s?.liquidity_ratio == null ? null : num(s.liquidity_ratio);
  const ratios: [string, string, string, string][] = [
    [
      "Profitability (Net Profit Margin)",
      npm == null ? "—" : `${(npm * 100).toFixed(1)}%`,
      "Net Profit ÷ Revenue",
      `${idr(s?.net_profit)} ÷ ${idr(s?.revenue)}`,
    ],
    [
      "Liabilities to Revenue",
      ltr == null ? "—" : `${(ltr * 100).toFixed(1)}%`,
      "Outstanding payables ÷ Revenue",
      `${idr(s?.ap_outstanding)} ÷ ${idr(s?.revenue)}`,
    ],
    [
      "Liquidity Ratio",
      liq == null ? "—" : `${liq.toFixed(2)}x`,
      "(Cash position + AR outstanding) ÷ AP outstanding",
      `(${idr(s?.cash_position)} + ${idr(s?.ar_outstanding)}) ÷ ${idr(s?.ap_outstanding)}`,
    ],
  ];
  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
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
        <TabsList className="flex h-auto w-full flex-wrap justify-start sm:w-fit">
          <TabsTrigger value="pnl">Monthly P&amp;L</TabsTrigger>
          <TabsTrigger value="is">Income Statement</TabsTrigger>
          <TabsTrigger value="cfs">Cash Flow Statement</TabsTrigger>
          <TabsTrigger value="ratios">Financial Ratios</TabsTrigger>
          <TabsTrigger value="ar">AR aging</TabsTrigger>
          <TabsTrigger value="ap">AP aging</TabsTrigger>
        </TabsList>

        <TabsContent value="is">
          <ReportCard
            title={`Income Statement · ${year}`}
            onExport={() =>
              downloadCsv(
                `income-statement-${year}.csv`,
                ["Line item", ...pnl.map((r) => r.month)],
                [
                  ["Revenue", ...pnl.map((r) => r.revenue)],
                  ["Cost of Services", ...pnl.map((r) => r.cost)],
                  ["Gross Profit", ...pnl.map((r) => r.grossProfit)],
                  ["Overhead", ...pnl.map((r) => r.overhead)],
                  ["Net Profit", ...pnl.map((r) => r.netProfit)],
                ],
              )
            }
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Same figures as the Monthly P&amp;L. Voided records and investor transactions are
              excluded.
            </p>
            <StatementTable
              months={pnl.map((r) => monthLabel(r.month))}
              rows={[
                { label: "Revenue", values: pnl.map((r) => r.revenue) },
                { label: "Cost of Services", values: pnl.map((r) => r.cost) },
                { label: "Gross Profit", values: pnl.map((r) => r.grossProfit), bold: true },
                { label: "Overhead", values: pnl.map((r) => r.overhead) },
                { label: "Net Profit", values: pnl.map((r) => r.netProfit), bold: true },
              ]}
            />
          </ReportCard>
        </TabsContent>

        <TabsContent value="cfs">
          <ReportCard
            title={`Cash Flow Statement · ${year}`}
            onExport={() =>
              downloadCsv(
                `cash-flow-statement-${year}.csv`,
                ["Section", "Line item", ...pnl.map((r) => r.month)],
                [
                  ["Operating", "Receipts from customers", ...pnl.map((r) => r.opIn)],
                  ["Operating", "Payments to vendors & overhead", ...pnl.map((r) => -r.opOut)],
                  ["Operating", "Net operating cash flow", ...pnl.map((r) => r.opIn - r.opOut)],
                  ["Financing", "Investor loans in", ...pnl.map((r) => r.finIn)],
                  ["Financing", "Investor repayments", ...pnl.map((r) => -r.finOut)],
                  ["Financing", "Net financing cash flow", ...pnl.map((r) => r.finIn - r.finOut)],
                ],
              )
            }
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Built from the Cash Flow ledger and Investor Transactions. Operating covers customer
              receipts, vendor payments and overhead payments; Financing covers investor loans and
              repayments only.
            </p>
            <StatementTable
              months={pnl.map((r) => monthLabel(r.month))}
              rows={[
                { label: "Operating activities", section: true, values: [] },
                { label: "Receipts from customers", values: pnl.map((r) => r.opIn) },
                { label: "Payments to vendors & overhead", values: pnl.map((r) => -r.opOut) },
                {
                  label: "Net operating cash flow",
                  values: pnl.map((r) => r.opIn - r.opOut),
                  bold: true,
                },
                { label: "Financing activities", section: true, values: [] },
                { label: "Investor loans in", values: pnl.map((r) => r.finIn) },
                { label: "Investor repayments", values: pnl.map((r) => -r.finOut) },
                {
                  label: "Net financing cash flow",
                  values: pnl.map((r) => r.finIn - r.finOut),
                  bold: true,
                },
              ]}
            />
          </ReportCard>
        </TabsContent>

        <TabsContent value="ratios">
          <ReportCard
            title="Financial Ratios · to date"
            onExport={() =>
              downloadCsv(
                "financial-ratios.csv",
                ["Ratio", "Value", "Formula", "Inputs"],
                ratios,
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ratio</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Formula</TableHead>
                  <TableHead>Inputs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ratios.map(([name, value, formula, inputs]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right font-display text-base">{value}</TableCell>
                    <TableCell className="text-muted-foreground">{formula}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inputs}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

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

function StatementTable({
  months,
  rows,
}: {
  months: string[];
  rows: { label: string; values: number[]; bold?: boolean; section?: boolean }[];
}) {
  if (months.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">No records to display.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-48">Line item</TableHead>
          {months.map((m) => (
            <TableHead key={m} className="whitespace-nowrap text-right">
              {m}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) =>
          r.section ? (
            <TableRow key={r.label} className="bg-muted/50">
              <TableCell colSpan={months.length + 1} className="font-semibold">
                {r.label}
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={r.label}>
              <TableCell className={r.bold ? "font-semibold" : "pl-6"}>{r.label}</TableCell>
              {r.values.map((v, i) => (
                <TableCell
                  key={i}
                  className={`whitespace-nowrap text-right ${r.bold ? "font-semibold" : ""}`}
                >
                  {idr(v)}
                </TableCell>
              ))}
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
}
