import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Ban, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, VoidDialog, VoidedNote } from "@/components/record-actions";
import { numOrNull } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { idr, num, fmtDate } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";
import { cashFlowDirection, cashFlowLabel } from "@/lib/finance-rules";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Cash Flow Ledger | Loka Logistics ERP" },
      {
        name: "description",
        content:
          "Customer receipts, vendor payments and overhead payments in one operating cash flow ledger.",
      },
      { property: "og:title", content: "Cash Flow Ledger | Loka Logistics ERP" },
      {
        property: "og:description",
        content: "Actual operating cash in and out for Loka Logistics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { canSeeExecutive, canEditFinance } = useRoles();
  const qc = useQueryClient();
  const [editTx, setEditTx] = useState<{ id: string; date: string; amount: string; method: string; notes: string } | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = () => {
    for (const k of ["payments", "ap", "ar", "overhead", "dashboard", "reports"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const saveEdit = async () => {
    if (!editTx) return;
    setSaving(true);
    const { error } = await supabase.rpc("edit_cash_transaction", {
      _id: editTx.id,
      _date: editTx.date,
      _amount: numOrNull(editTx.amount) ?? 0,
      _method: editTx.method as "Bank Transfer" | "Cash" | "Giro",
      _notes: editTx.notes,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Transaction corrected");
    setEditTx(null);
    refresh();
  };

  const { data } = useQuery({
    queryKey: ["payments"],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const [rows, summary] = await Promise.all([
        supabase
          .from("payment_transactions")
          .select("*")
          .order("transaction_date", { ascending: false }),
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
          Entries are created automatically when a vendor bill, customer invoice or overhead cost is
          paid.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Operating cash in</CardDescription>
            <CardTitle className="font-display text-xl text-success">
              {idr(m?.op_cash_in)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Operating cash out</CardDescription>
            <CardTitle className="font-display text-xl text-destructive">
              {idr(m?.op_cash_out)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net operating cash flow</CardDescription>
            <CardTitle className="font-display text-xl">{idr(m?.net_operating_cash)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Financing (investor, separate)</CardDescription>
            <CardTitle className="font-display text-xl">{idr(m?.net_financing)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions ({list.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
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
                        {inbound ? (
                          <ArrowUpRight className="h-3 w-3 text-success" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 text-destructive" />
                        )}
                        {cashFlowLabel(t.reference_type)}
                      </Badge>
                      {t.is_void && (
                        <Badge variant="secondary" className="ml-2">
                          Voided
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{t.payment_method}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.notes}
                      {t.is_void && <VoidedNote at={t.voided_at} by={t.voided_by} reason={t.void_reason} />}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${t.is_void ? "line-through" : inbound ? "text-success" : "text-destructive"}`}
                    >
                      {inbound ? "+" : "-"}
                      {idr(num(t.amount))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {canEditFinance && !t.is_void && (
                        <>
                          {t.reference_type !== "OPERATIONAL_EXPENSE" ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Edit"
                              onClick={() =>
                                setEditTx({
                                  id: t.id,
                                  date: t.transaction_date,
                                  amount: String(t.amount),
                                  method: t.payment_method,
                                  notes: t.notes ?? "",
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="mr-2 text-xs text-muted-foreground">Edit on Overhead page</span>
                          )}
                          <Button size="icon" variant="ghost" title="Void" onClick={() => setVoidId(t.id)}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No cash movements recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>
          {editTx && (
            <div className="space-y-4">
              <FormField label="Date" type="date" value={editTx.date} onChange={(v) => setEditTx({ ...editTx, date: v })} />
              <FormField label="Amount (IDR)" type="number" value={editTx.amount} onChange={(v) => setEditTx({ ...editTx, amount: v })} />
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={editTx.method} onValueChange={(v) => setEditTx({ ...editTx, method: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Bank Transfer", "Cash", "Giro"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FormField label="Notes" value={editTx.notes} onChange={(v) => setEditTx({ ...editTx, notes: v })} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveEdit} disabled={saving}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VoidDialog
        open={!!voidId}
        onOpenChange={(o) => !o && setVoidId(null)}
        title="Void transaction"
        description="The linked bill, invoice or overhead balance is restored in the same step. The entry stays visible, marked Voided."
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc("void_cash_transaction", { _id: voidId ?? "", _reason: reason });
          if (error) throw error;
          toast.success("Transaction voided");
          refresh();
        }}
      />
    </div>
  );
}
