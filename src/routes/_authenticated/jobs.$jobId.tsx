import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle2, FileText, Truck } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { idr, num, fmtDate, today, addDays } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({
    meta: [
      { title: "Job Sheet Detail | Loka Logistics ERP" },
      {
        name: "description",
        content: "Vendor cost lines, job completion and invoice issuing for a single logistics job sheet.",
      },
      { property: "og:title", content: "Job Sheet Detail | Loka Logistics ERP" },
      { property: "og:description", content: "Manage vendor costs and invoicing for a job sheet." },
    ],
  }),
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = useParams({ from: "/_authenticated/jobs/$jobId" });
  const qc = useQueryClient();
  const { canEditJobs, canEditFinance } = useRoles();
  const [apOpen, setApOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [ap, setAp] = useState({
    vendor_id: "",
    item_cost_description: "",
    invoice_amount: "",
    payment_terms_days: "30",
    payment_type: "Term",
  });
  const [inv, setInv] = useState({ invoice_no: "", invoice_date: today(), amount: "", terms: "30" });

  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, customers(id, company_name)")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: costs } = useQuery({
    queryKey: ["job-ap", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, subcontractors_vendors(vendor_name)")
        .eq("job_id", jobId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["job-ar", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts_receivable").select("*").eq("job_id", jobId);
      if (error) throw error;
      return data;
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcontractors_vendors")
        .select("id, vendor_name")
        .order("vendor_name");
      if (error) throw error;
      return data;
    },
  });

  const addCost = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts_payable").insert({
        job_id: jobId,
        vendor_id: ap.vendor_id || null,
        item_cost_description: ap.item_cost_description,
        invoice_amount: num(ap.invoice_amount),
        payment_terms_days: Number(ap.payment_terms_days || 0),
        due_date: addDays(today(), Number(ap.payment_terms_days || 0)),
        payment_type: ap.payment_type as "Term" | "Cash",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vendor cost logged");
      setApOpen(false);
      setAp({ ...ap, item_cost_description: "", invoice_amount: "" });
      qc.invalidateQueries({ queryKey: ["job-ap", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "Draft" | "In Progress" | "Completed" | "Cancelled") => {
      const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job status updated");
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issueInvoice = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts_receivable").insert({
        invoice_no: inv.invoice_no,
        job_id: jobId,
        customer_id: job?.customer_id ?? null,
        invoice_date: inv.invoice_date,
        amount: num(inv.amount || job?.selling_price),
        payment_terms_days: Number(inv.terms || 0),
        due_date: addDays(inv.invoice_date, Number(inv.terms || 0)),
        status: "Issued",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice issued");
      setInvOpen(false);
      qc.invalidateQueries({ queryKey: ["job-ar", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!job) return <p className="text-muted-foreground">Loading job sheet…</p>;

  const totalCost = (costs ?? []).reduce((s, c) => s + num(c.invoice_amount), 0);
  const margin = num(job.selling_price) - totalCost;

  const steps = [
    { label: "Create job", done: true },
    { label: "Log AP vendor costs", done: (costs ?? []).length > 0 },
    { label: "Complete job", done: job.status === "Completed" },
    { label: "Issue AR invoice", done: (invoices ?? []).length > 0 },
    {
      label: "Record payments",
      done: (invoices ?? []).some((i) => num(i.paid_amount) > 0),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Job {job.job_sheet_no}</h1>
          <p className="text-sm text-muted-foreground">
            {job.customers?.company_name ?? "No customer"} &middot; {job.origin} → {job.destination}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={job.status} />
          {canEditJobs && job.status === "Draft" && (
            <Button variant="outline" onClick={() => setStatus.mutate("In Progress")}>
              <Truck className="mr-2 h-4 w-4" /> Start job
            </Button>
          )}
          {canEditJobs && job.status === "In Progress" && (
            <Button onClick={() => setStatus.mutate("Completed")}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Complete job
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-4 py-4">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span className={s.done ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Selling price</CardDescription>
            <CardTitle className="font-display text-xl">{idr(job.selling_price)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Actual vendor cost</CardDescription>
            <CardTitle className="font-display text-xl">{idr(totalCost)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross margin</CardDescription>
            <CardTitle className={`font-display text-xl ${margin >= 0 ? "text-success" : "text-destructive"}`}>
              {idr(margin)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Vendor cost lines (AP)</CardTitle>
          <Dialog open={apOpen} onOpenChange={setApOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Add cost
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log vendor cost</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Select value={ap.vendor_id} onValueChange={(v) => setAp({ ...ap, vendor_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {(vendors ?? []).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.vendor_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cost description</Label>
                  <Input
                    value={ap.item_cost_description}
                    onChange={(e) => setAp({ ...ap, item_cost_description: e.target.value })}
                    placeholder="Trucking Jakarta - Surabaya"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Invoice amount (IDR)</Label>
                    <Input
                      type="number"
                      value={ap.invoice_amount}
                      onChange={(e) => setAp({ ...ap, invoice_amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>TOP (days)</Label>
                    <Input
                      type="number"
                      value={ap.payment_terms_days}
                      onChange={(e) => setAp({ ...ap, payment_terms_days: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Payment type</Label>
                  <Select value={ap.payment_type} onValueChange={(v) => setAp({ ...ap, payment_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Term">Term / Tempo</SelectItem>
                      <SelectItem value="Cash">Cash / Tunai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addCost.mutate()} disabled={addCost.isPending}>
                  Save cost line
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(costs ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.subcontractors_vendors?.vendor_name ?? "-"}</TableCell>
                  <TableCell>{c.item_cost_description}</TableCell>
                  <TableCell>{fmtDate(c.due_date)}</TableCell>
                  <TableCell className="text-right">{idr(c.invoice_amount)}</TableCell>
                  <TableCell className="text-right">{idr(c.balance_remaining)}</TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
              {(costs ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No vendor costs logged yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Customer invoices (AR)</CardTitle>
            <CardDescription>Invoices can be issued once the job is completed.</CardDescription>
          </div>
          {canEditFinance && (
            <Dialog open={invOpen} onOpenChange={setInvOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={job.status !== "Completed"}>
                  <FileText className="mr-2 h-4 w-4" /> Issue invoice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Issue invoice for {job.job_sheet_no}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Invoice no.</Label>
                    <Input
                      value={inv.invoice_no}
                      onChange={(e) => setInv({ ...inv, invoice_no: e.target.value })}
                      placeholder="INV/2026/001"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Invoice date</Label>
                      <Input
                        type="date"
                        value={inv.invoice_date}
                        onChange={(e) => setInv({ ...inv, invoice_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>TOP (days)</Label>
                      <Input
                        type="number"
                        value={inv.terms}
                        onChange={(e) => setInv({ ...inv, terms: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (IDR)</Label>
                    <Input
                      type="number"
                      value={inv.amount}
                      placeholder={String(job.selling_price)}
                      onChange={(e) => setInv({ ...inv, amount: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => issueInvoice.mutate()} disabled={!inv.invoice_no || issueInvoice.isPending}>
                    Issue invoice
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.invoice_no}</TableCell>
                  <TableCell>{fmtDate(i.invoice_date)}</TableCell>
                  <TableCell>{fmtDate(i.due_date)}</TableCell>
                  <TableCell className="text-right">{idr(i.amount)}</TableCell>
                  <TableCell className="text-right">{idr(i.remaining_amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={i.status} />
                  </TableCell>
                </TableRow>
              ))}
              {(invoices ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No invoice issued yet.
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
