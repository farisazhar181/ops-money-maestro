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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { idr, num, fmtDate, today, isOverdue, daysUntil } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/payables")({
  head: () => ({
    meta: [
      { title: "Accounts Payable | Loka Logistics ERP" },
      {
        name: "description",
        content: "Vendor bill schedule with weekly aging, payment terms and settlement recording.",
      },
      { property: "og:title", content: "Accounts Payable | Loka Logistics ERP" },
      { property: "og:description", content: "Track vendor obligations and payments for Loka Logistics." },
    ],
  }),
  component: PayablesPage,
});

function PayablesPage() {
  const qc = useQueryClient();
  const { canEditFinance } = useRoles();
  const [payFor, setPayFor] = useState<{ id: string; label: string; balance: number } | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "Bank Transfer", date: today(), notes: "" });

  const { data: rows } = useQuery({
    queryKey: ["ap"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, subcontractors_vendors(vendor_name), jobs(job_sheet_no)")
        .order("due_date");
      if (error) throw error;
      return data;
    },
  });

  const record = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      const amount = num(pay.amount);
      const { data: current, error: readErr } = await supabase
        .from("accounts_payable")
        .select("paid_amount")
        .eq("id", payFor.id)
        .single();
      if (readErr) throw readErr;
      const { error } = await supabase
        .from("accounts_payable")
        .update({ paid_amount: num(current.paid_amount) + amount })
        .eq("id", payFor.id);
      if (error) throw error;
      const { data: userRes } = await supabase.auth.getUser();
      const { error: txErr } = await supabase.from("payment_transactions").insert({
        reference_type: "AP_PAYMENT",
        reference_id: payFor.id,
        transaction_date: pay.date,
        amount,
        payment_method: pay.method as "Bank Transfer" | "Cash" | "Giro",
        notes: pay.notes || `Payment to ${payFor.label}`,
        created_by: userRes.user?.id ?? null,
      });
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      toast.success("Vendor payment recorded");
      setPayFor(null);
      setPay({ amount: "", method: "Bank Transfer", date: today(), notes: "" });
      qc.invalidateQueries({ queryKey: ["ap"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = rows ?? [];
  const outstanding = list.reduce((s, r) => s + num(r.balance_remaining), 0);
  const dueThisWeek = list.filter(
    (r) => num(r.balance_remaining) > 0 && daysUntil(r.due_date) <= 7 && daysUntil(r.due_date) >= 0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Accounts Payable</h1>
        <p className="text-sm text-muted-foreground">
          {list.length} vendor bills &middot; {idr(outstanding)} outstanding &middot; {dueThisWeek.length} due
          within 7 days
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule of AP</CardTitle>
          <CardDescription>Cost lines are logged against a job sheet from the job detail page.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>TOP</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Invoice</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => {
                const bal = num(r.balance_remaining);
                const late = isOverdue(r.due_date, bal);
                return (
                  <TableRow key={r.id} className={late ? "bg-destructive/5" : undefined}>
                    <TableCell className="font-medium">{r.subcontractors_vendors?.vendor_name ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.jobs?.job_sheet_no ?? "-"}</TableCell>
                    <TableCell>{r.item_cost_description}</TableCell>
                    <TableCell>{r.payment_terms_days}d</TableCell>
                    <TableCell>
                      {fmtDate(r.due_date)}
                      {bal > 0 && (
                        <span className={`ml-2 text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
                          {late ? `${Math.abs(daysUntil(r.due_date))}d late` : `in ${daysUntil(r.due_date)}d`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{idr(r.invoice_amount)}</TableCell>
                    <TableCell className="text-right">{idr(r.paid_amount)}</TableCell>
                    <TableCell className="text-right font-medium">{idr(bal)}</TableCell>
                    <TableCell>
                      <StatusBadge status={late ? "Overdue" : r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {canEditFinance && bal > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPayFor({
                              id: r.id,
                              label: r.subcontractors_vendors?.vendor_name ?? "vendor",
                              balance: bal,
                            })
                          }
                        >
                          <Banknote className="mr-1 h-4 w-4" /> Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    No vendor bills logged yet.
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
            <DialogTitle>Pay vendor · {payFor?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (balance {idr(payFor?.balance ?? 0)})</Label>
              <Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
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
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => record.mutate()} disabled={!pay.amount || record.isPending}>
              Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
