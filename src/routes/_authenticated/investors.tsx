import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Pencil, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FormField, VoidDialog, VoidedNote } from "@/components/record-actions";
import { fmtDate, idr, numOrNull, today } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/investors")({
  head: () => ({
    meta: [
      { title: "Investor Transactions | Loka Logistics ERP" },
      {
        name: "description",
        content:
          "Investor loans in and repayments, tracked as financing separate from operating profit.",
      },
      { property: "og:title", content: "Investor Transactions | Loka Logistics ERP" },
      {
        property: "og:description",
        content: "Financing movements kept apart from Loka Logistics operating figures.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestorsPage,
});

type TxType = "Loan In" | "Repayment";
const blank = () => ({ date: today(), type: "Loan In" as TxType, amount: "", note: "" });

function InvestorsPage() {
  const qc = useQueryClient();
  const { canSeeExecutive, canManageOverhead: canManage, loading } = useRoles();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [voidId, setVoidId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["investors"],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const [rows, summary] = await Promise.all([
        supabase
          .from("investor_transactions")
          .select("*")
          .order("transaction_date", { ascending: false }),
        supabase.rpc("report_summary"),
      ]);
      if (rows.error) throw rows.error;
      if (summary.error) throw summary.error;
      return { rows: rows.data ?? [], summary: summary.data?.[0] };
    },
  });

  const refresh = () => {
    for (const k of ["investors", "payments", "dashboard", "reports"])
      qc.invalidateQueries({ queryKey: [k] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const args = {
        _date: form.date,
        _type: form.type,
        _amount: numOrNull(form.amount) ?? 0,
        _note: form.note,
      };
      const { error } = editId
        ? await supabase.rpc("edit_investor_transaction", { _id: editId, ...args })
        : await supabase.rpc("create_investor_transaction", args);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editId ? "Transaction corrected" : "Transaction recorded");
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!canSeeExecutive)
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" /> Restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Investor transactions are available to Owner and Finance only.
        </CardContent>
      </Card>
    );

  const list = data?.rows ?? [];
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Investor Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Financing only — never counted in revenue, profit or operating cash flow.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditId(null);
              setForm(blank());
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add transaction
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Loans in</CardDescription>
            <CardTitle className="font-display text-xl text-success">
              {idr(s?.financing_in)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Repayments</CardDescription>
            <CardTitle className="font-display text-xl text-destructive">
              {idr(s?.financing_out)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net financing (outstanding)</CardDescription>
            <CardTitle className="font-display text-xl">{idr(s?.net_financing)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries ({list.length})</CardTitle>
          <CardDescription>
            Voided entries stay visible and are excluded from totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id} className={r.is_void ? "opacity-50" : undefined}>
                  <TableCell>{fmtDate(r.transaction_date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.transaction_type}</Badge>
                    {r.is_void && (
                      <Badge variant="secondary" className="ml-2">
                        Voided
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.note}
                    {r.is_void && (
                      <VoidedNote at={r.voided_at} by={r.voided_by} reason={r.void_reason} />
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${r.is_void ? "line-through" : ""}`}
                  >
                    {idr(r.amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {canManage && !r.is_void && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() => {
                            setEditId(r.id);
                            setForm({
                              date: r.transaction_date,
                              type: r.transaction_type,
                              amount: String(r.amount),
                              note: r.note,
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Void"
                          onClick={() => setVoidId(r.id)}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No investor transactions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit investor transaction" : "Add investor transaction"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as TxType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Loan In">Loan In</SelectItem>
                  <SelectItem value="Repayment">Repayment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormField
              label="Amount (IDR)"
              type="number"
              value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })}
            />
            <FormField
              label="Date"
              type="date"
              value={form.date}
              onChange={(v) => setForm({ ...form, date: v })}
            />
            <FormField
              label="Note"
              value={form.note}
              onChange={(v) => setForm({ ...form, note: v })}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VoidDialog
        open={!!voidId}
        onOpenChange={(o) => !o && setVoidId(null)}
        title="Void investor transaction"
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc("void_investor_transaction", {
            _id: voidId ?? "",
            _reason: reason,
          });
          if (error) throw error;
          toast.success("Transaction voided");
          refresh();
        }}
      />
    </div>
  );
}
