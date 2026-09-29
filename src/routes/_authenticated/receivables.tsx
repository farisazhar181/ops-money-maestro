import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { idr, num, fmtDate, today, isOverdue, daysUntil } from "@/lib/format";
import { paymentDateError } from "@/lib/finance-rules";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/receivables")({
  head: () => ({
    meta: [
      { title: "Accounts Receivable | Loka Logistics ERP" },
      {
        name: "description",
        content: "Customer invoice aging tracker with overdue badges and payment receipts recording.",
      },
      { property: "og:title", content: "Accounts Receivable | Loka Logistics ERP" },
      { property: "og:description", content: "Track outstanding customer invoices and receipts." },
    ],
  }),
  component: ReceivablesPage,
});

function ReceivablesPage() {
  const qc = useQueryClient();
  const { canEditFinance } = useRoles();
  const [payFor, setPayFor] = useState<{ id: string; invoice_no: string; balance: number; minDate: string } | null>(null);
  const [pay, setPay] = useState({ amount: "", date: today() });

  const { data: rows } = useQuery({
    queryKey: ["ar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, customers(company_name), jobs(job_sheet_no)")
        .order("due_date");
      if (error) throw error;
      return data;
    },
  });

  const record = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      const dateErr = paymentDateError(pay.date, payFor.minDate);
      if (dateErr) throw new Error(dateErr);
      const { error } = await supabase.rpc("record_ar_payment", {
        _ar_id: payFor.id,
        _payment_date: pay.date,
        _amount: num(pay.amount),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Receipt recorded");
      setPayFor(null);
      setPay({ amount: "", date: today() });
      qc.invalidateQueries({ queryKey: ["ar"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allRows = rows ?? [];
  const list = allRows.filter((r) => !r.is_void);
  const outstanding = list.reduce((s, r) => s + num(r.remaining_amount), 0);
  const overdue = list.filter((r) => isOverdue(r.due_date, num(r.remaining_amount)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Accounts Receivable</h1>
        <p className="text-sm text-muted-foreground">
          {list.length} invoices &middot; {idr(outstanding)} outstanding &middot; {overdue.length} overdue
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule of AR / aging tracker</CardTitle>
          <CardDescription>Overdue invoices are flagged automatically against today's date.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Invoice date</TableHead>
                <TableHead>TOP</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRows.map((r) => {
                const bal = num(r.remaining_amount);
                const late = isOverdue(r.due_date, bal);
                const d = daysUntil(r.due_date);
                return (
                  <TableRow key={r.id} className={r.is_void ? "opacity-50" : late ? "bg-destructive/5" : undefined} title={r.is_void ? `Voided ${fmtDate(r.voided_at)}: ${r.void_reason ?? ""}` : undefined}>
                    <TableCell className="font-medium">{r.invoice_no}</TableCell>
                    <TableCell>{r.customers?.company_name ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.jobs?.job_sheet_no ?? "-"}</TableCell>
                    <TableCell>{fmtDate(r.invoice_date)}</TableCell>
                    <TableCell>{r.payment_terms_days}d</TableCell>
                    <TableCell>
                      {fmtDate(r.due_date)}
                      {bal > 0 && (
                        <span className={`ml-2 text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
                          {late ? `${Math.abs(d)}d late` : `in ${d}d`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{idr(r.amount)}</TableCell>
                    <TableCell className="text-right">{idr(r.paid_amount)}</TableCell>
                    <TableCell className="text-right font-medium">{idr(bal)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.is_void ? "Voided" : late ? "Overdue" : r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {canEditFinance && bal > 0 && !r.is_void && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPayFor({ id: r.id, invoice_no: r.invoice_no, balance: bal, minDate: r.invoice_date })}
                        >
                          <Banknote className="mr-1 h-4 w-4" /> Record payment
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {allRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    No invoices yet. Issue one from a completed job sheet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record receipt · {payFor?.invoice_no}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (balance {idr(payFor?.balance ?? 0)})</Label>
              <Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date (not before {fmtDate(payFor?.minDate)})</Label>
              <Input type="date" min={payFor?.minDate} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => record.mutate()} disabled={!pay.amount || record.isPending}>
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
