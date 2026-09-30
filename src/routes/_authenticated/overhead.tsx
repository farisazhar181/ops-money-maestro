import { useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Ban, Pencil, Plus, ShieldAlert } from "lucide-react";
import { VoidedNote } from "@/components/record-actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtDate, idr, numOrNull, today } from "@/lib/format";
import { paymentDateError } from "@/lib/finance-rules";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/overhead")({
  head: () => ({
    meta: [
      { title: "Overhead Costs | Loka Logistics ERP" },
      {
        name: "description",
        content: "Record fixed and variable overhead costs and pay them into the cash flow ledger.",
      },
      { property: "og:title", content: "Overhead Costs | Loka Logistics ERP" },
      {
        property: "og:description",
        content: "Overhead costs that reduce Loka Logistics net profit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverheadPage,
});

type Row = { id: string; cost_date: string; note: string };

function OverheadPage() {
  const qc = useQueryClient();
  const { canSeeExecutive, canManageOverhead, loading } = useRoles();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    cost_date: today(),
    cost_type: "Fixed",
    amount: "",
    note: "",
  });
  const [payFor, setPayFor] = useState<Row | null>(null);
  const [pay, setPay] = useState({ date: today(), method: "Bank Transfer" });
  const [voidFor, setVoidFor] = useState<Row | null>(null);
  const [reason, setReason] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["overhead"],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("overhead_costs")
        .select("*")
        .order("cost_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    for (const key of ["overhead", "payments", "dashboard", "reports"])
      qc.invalidateQueries({ queryKey: [key] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const amount = numOrNull(form.amount);
      if (amount === null || amount <= 0) throw new Error("Amount must be greater than zero");
      if (!form.note.trim()) throw new Error("A note is required");
      const args = {
        _date: form.cost_date,
        _type: form.cost_type as "Fixed" | "Variable",
        _amount: amount,
        _note: form.note.trim(),
      };
      const { error } = editId
        ? await supabase.rpc("edit_overhead", { _id: editId, ...args })
        : await supabase.rpc("create_overhead", args);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editId ? "Overhead cost corrected" : "Overhead cost recorded");
      setAddOpen(false);
      setEditId(null);
      setForm({ cost_date: today(), cost_type: "Fixed", amount: "", note: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      const err = paymentDateError(pay.date, payFor.cost_date);
      if (err) throw new Error(err);
      const { error } = await supabase.rpc("pay_overhead", {
        _id: payFor.id,
        _payment_date: pay.date,
        _method: pay.method as "Bank Transfer" | "Cash" | "Giro",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Overhead paid");
      setPayFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!voidFor) return;
      const { error } = await supabase.rpc("void_overhead", { _id: voidFor.id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Overhead cost and its payment voided");
      setVoidFor(null);
      setReason("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!canSeeExecutive) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" /> Restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Overhead costs are available to Owner and Finance only.
        </CardContent>
      </Card>
    );
  }

  const list = rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Overhead Costs</h1>
          <p className="text-sm text-muted-foreground">
            Subtracted from Net Profit in the month of the cost date.{" "}
          </p>
        </div>
        {canManageOverhead && (
          <Button
            onClick={() => {
              setEditId(null);
              setForm({ cost_date: today(), cost_type: "Fixed", amount: "", note: "" });
              setAddOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add overhead
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries ({list.length})</CardTitle>
          <CardDescription>
            Voided entries stay visible and are excluded from all totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => {
                const paid = !!r.payment_transaction_id && !r.is_void;
                return (
                  <TableRow key={r.id} className={r.is_void ? "opacity-50" : undefined}>
                    <TableCell>{fmtDate(r.cost_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.cost_type}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.note}
                      {r.is_void && (
                        <VoidedNote at={r.voided_at} by={r.voided_by} reason={r.void_reason} />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.is_void ? (
                        <Badge variant="secondary">Voided</Badge>
                      ) : paid ? (
                        <Badge variant="outline">Paid</Badge>
                      ) : (
                        <Badge variant="outline">Unpaid</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{idr(r.amount)}</TableCell>
                    <TableCell className="text-right">
                      {canManageOverhead && !r.is_void && (
                        <div className="flex justify-end gap-2">
                          {!paid && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPay({ date: today(), method: "Bank Transfer" });
                                setPayFor(r);
                              }}
                            >
                              <Banknote className="mr-1 h-4 w-4" /> Pay
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditId(r.id);
                              setForm({
                                cost_date: r.cost_date,
                                cost_type: r.cost_type,
                                amount: String(r.amount),
                                note: r.note,
                              });
                              setAddOpen(true);
                            }}
                          >
                            <Pencil className="mr-1 h-4 w-4" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setVoidFor(r)}>
                            <Ban className="mr-1 h-4 w-4" /> Void
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No overhead costs recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit overhead cost" : "Add overhead cost"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.cost_date}
                onChange={(e) => setForm({ ...form, cost_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.cost_type}
                onValueChange={(v) => setForm({ ...form, cost_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fixed">Fixed</SelectItem>
                  <SelectItem value="Variable">Variable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (IDR)</Label>
              <MoneyInput
                value={form.amount}
                onChange={(v) => setForm({ ...form, amount: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay overhead · {payFor?.note}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment date (not before {fmtDate(payFor?.cost_date)})</Label>
              <Input
                type="date"
                min={payFor?.cost_date}
                value={pay.date}
                onChange={(e) => setPay({ ...pay, date: e.target.value })}
              />
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
          <DialogFooter>
            <Button onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voidFor} onOpenChange={(o) => !o && setVoidFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void overhead · {voidFor?.note}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Its linked cash-flow payment, if any, is voided too.
          </p>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => voidMutation.mutate()}
              disabled={!reason.trim() || voidMutation.isPending}
            >
              Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
