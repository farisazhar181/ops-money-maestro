import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/record-actions";
import { addDays, idr, numOrNull } from "@/lib/format";

export type ApRow = {
  id: string;
  vendor_id: string | null;
  item_cost_description: string | null;
  invoice_amount: number;
  paid_amount: number;
  payment_terms_days: number;
  bill_date: string;
};
export type ArRow = {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  invoice_date: string;
  amount: number;
  paid_amount: number;
  payment_terms_days: number;
};

export function EditApDialog({ row, onClose, onSaved }: { row: ApRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ vendor_id: "", description: "", amount: "", bill_date: "", terms: "" });
  const [pending, setPending] = useState(false);
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subcontractors_vendors").select("id, vendor_name").order("vendor_name");
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (row)
      setF({
        vendor_id: row.vendor_id ?? "",
        description: row.item_cost_description ?? "",
        amount: String(row.invoice_amount),
        bill_date: row.bill_date,
        terms: String(row.payment_terms_days),
      });
  }, [row]);
  const save = async () => {
    if (!row) return;
    setPending(true);
    const terms = numOrNull(f.terms) ?? 0;
    const { error } = await supabase.rpc("edit_ap", {
      _id: row.id,
      _vendor_id: f.vendor_id || (null as unknown as string),
      _description: f.description,
      _amount: numOrNull(f.amount) ?? 0,
      _terms: terms,
      _due_date: addDays(f.bill_date, terms),
      _bill_date: f.bill_date,
    });
    setPending(false);
    if (error) return toast.error(error.message);
    toast.success("Vendor cost corrected");
    onSaved();
    onClose();
  };
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit vendor cost</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select value={f.vendor_id} onValueChange={(v) => setF({ ...f, vendor_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {(vendors.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.vendor_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormField label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
          <FormField
            label={`Amount (IDR) — not below paid ${idr(row?.paid_amount)}`}
            type="number"
            value={f.amount}
            onChange={(v) => setF({ ...f, amount: v })}
          />
          <FormField label="Bill date" type="date" value={f.bill_date} onChange={(v) => setF({ ...f, bill_date: v })} />
          <FormField label="TOP (days)" type="number" value={f.terms} onChange={(v) => setF({ ...f, terms: v })} />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditArDialog({ row, onClose, onSaved }: { row: ArRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ invoice_no: "", customer_id: "", invoice_date: "", amount: "", terms: "" });
  const [pending, setPending] = useState(false);
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, company_name").order("company_name");
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (row)
      setF({
        invoice_no: row.invoice_no,
        customer_id: row.customer_id ?? "",
        invoice_date: row.invoice_date,
        amount: String(row.amount),
        terms: String(row.payment_terms_days),
      });
  }, [row]);
  const save = async () => {
    if (!row) return;
    setPending(true);
    const terms = numOrNull(f.terms) ?? 0;
    const { error } = await supabase.rpc("edit_ar", {
      _id: row.id,
      _invoice_no: f.invoice_no,
      _customer_id: f.customer_id || (null as unknown as string),
      _invoice_date: f.invoice_date,
      _amount: numOrNull(f.amount) ?? 0,
      _terms: terms,
      _due_date: addDays(f.invoice_date, terms),
    });
    setPending(false);
    if (error) return toast.error(error.message);
    toast.success("Invoice corrected");
    onSaved();
    onClose();
  };
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Invoice no." value={f.invoice_no} onChange={(v) => setF({ ...f, invoice_no: v })} />
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {(customers.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormField label="Invoice date" type="date" value={f.invoice_date} onChange={(v) => setF({ ...f, invoice_date: v })} />
          <FormField
            label={`Amount (IDR) — not below received ${idr(row?.paid_amount)}`}
            type="number"
            value={f.amount}
            onChange={(v) => setF({ ...f, amount: v })}
          />
          <FormField label="TOP (days)" type="number" value={f.terms} onChange={(v) => setF({ ...f, terms: v })} />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
