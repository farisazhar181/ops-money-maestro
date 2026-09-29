import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { idr, num, fmtDate } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";
import { cashFlowDirection, cashFlowLabel } from "@/lib/finance-rules";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Cash Flow Ledger | Loka Logistics ERP" },
      { name: "description", content: "Customer receipts, vendor payments and overhead payments in one operating cash flow ledger." },
      { property: "og:title", content: "Cash Flow Ledger | Loka Logistics ERP" },
      { property: "og:description", content: "Actual operating cash in and out for Loka Logistics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { canSeeExecutive } = useRoles();

  const { data } = useQuery({
    queryKey: ["payments"],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const [rows, summary] = await Promise.all([
        supabase.from("payment_transactions").select("*").order("transaction_date", { ascending: false }),
        supabase.rpc("report_summary"),
      ]);
      if (rows.error) throw rows.error;
      if (summary.error) throw summary.error;
      return { rows: rows.data ?? [], summary: summary.data?.[0] };
    },
  });

  const list = data?.rows ?? [];
  const m = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Cash Flow Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Entries are created automatically when a vendor bill, customer invoice or overhead cost is paid.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Operating cash in</CardDescription><CardTitle className="font-display text-xl text-success">{idr(m?.op_cash_in)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Operating cash out</CardDescription><CardTitle className="font-display text-xl text-destructive">{idr(m?.op_cash_out)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Net operating cash flow</CardDescription><CardTitle className="font-display text-xl">{idr(m?.net_operating_cash)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Financing (investor, separate)</CardDescription><CardTitle className="font-display text-xl">{idr(m?.net_financing)}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Transactions ({list.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((t) => {
                const inbound = cashFlowDirection(t.reference_type) === "in";
                return (
                  <TableRow key={t.id} className={t.is_void ? "opacity-50" : undefined}>
                    <TableCell>{fmtDate(t.transaction_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {inbound ? <ArrowUpRight className="h-3 w-3 text-success" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
                        {cashFlowLabel(t.reference_type)}
                      </Badge>
                      {t.is_void && <Badge variant="secondary" className="ml-2">Voided</Badge>}
                    </TableCell>
                    <TableCell>{t.payment_method}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.notes}
                      {t.is_void && <span className="block text-xs">Voided {fmtDate(t.voided_at)}: {t.void_reason}</span>}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${t.is_void ? "line-through" : inbound ? "text-success" : "text-destructive"}`}>
                      {inbound ? "+" : "-"}
                      {idr(num(t.amount))}
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No cash movements recorded yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
