import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowDownRight, ArrowUpRight } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { idr, num, fmtDate, today } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Cash Flow Ledger | Loka Logistics ERP" },
      {
        name: "description",
        content: "Every customer receipt, vendor payment and operational expense in one cash flow ledger.",
      },
      { property: "og:title", content: "Cash Flow Ledger | Loka Logistics ERP" },
      { property: "og:description", content: "Actual cash in and out for Loka Logistics operations." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const { canEditFinance } = useRoles();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    reference_type: "OPERATIONAL_EXPENSE",
    transaction_date: today(),
    amount: "",
    payment_method: "Bank Transfer",
    notes: "",
  });

  const { data: rows } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("payment_transactions").insert({
        reference_type: form.reference_type as "AR_RECEIPT" | "AP_PAYMENT" | "OPERATIONAL_EXPENSE",
        transaction_date: form.transaction_date,
        amount: num(form.amount),
        payment_method: form.payment_method as "Bank Transfer" | "Cash" | "Giro",
        notes: form.notes,
        created_by: userRes.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction recorded");
      setOpen(false);
      setForm({ ...form, amount: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = rows ?? [];
  const inflow = list.filter((t) => t.reference_type === "AR_RECEIPT").reduce((s, t) => s + num(t.amount), 0);
  const outflow = list.filter((t) => t.reference_type !== "AR_RECEIPT").reduce((s, t) => s + num(t.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Cash Flow Ledger</h1>
          <p className="text-sm text-muted-foreground">Actual money in and out across all jobs.</p>
        </div>
        {canEditFinance && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Record transaction
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record transaction</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={form.reference_type}
                    onValueChange={(v) => setForm({ ...form, reference_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AR_RECEIPT">Customer receipt (AR)</SelectItem>
                      <SelectItem value="AP_PAYMENT">Vendor payment (AP)</SelectItem>
                      <SelectItem value="OPERATIONAL_EXPENSE">Operational expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.transaction_date}
                      onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (IDR)</Label>
                    <Input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <Select
                    value={form.payment_method}
                    onValueChange={(v) => setForm({ ...form, payment_method: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Giro">Giro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!form.amount || create.isPending}>
                  Save transaction
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash in</CardDescription>
            <CardTitle className="font-display text-xl text-success">{idr(inflow)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash out</CardDescription>
            <CardTitle className="font-display text-xl text-destructive">{idr(outflow)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net cash flow</CardDescription>
            <CardTitle className="font-display text-xl">{idr(inflow - outflow)}</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((t) => {
                const inbound = t.reference_type === "AR_RECEIPT";
                return (
                  <TableRow key={t.id}>
                    <TableCell>{fmtDate(t.transaction_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {inbound ? (
                          <ArrowUpRight className="h-3 w-3 text-success" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 text-destructive" />
                        )}
                        {t.reference_type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.payment_method}</TableCell>
                    <TableCell className="text-muted-foreground">{t.notes}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${inbound ? "text-success" : "text-destructive"}`}
                    >
                      {inbound ? "+" : "-"}
                      {idr(t.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No cash movements recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
