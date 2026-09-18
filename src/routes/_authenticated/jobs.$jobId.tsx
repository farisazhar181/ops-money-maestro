import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Download, FileText, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { addDays, daysUntil, fmtDate, idr, num, pct, today } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({
    meta: [
      { title: "Job Sheet Detail | Loka Logistics ERP" },
      { name: "description", content: "Operational, financial, document, payment and activity details for a logistics job." },
      { property: "og:title", content: "Job Sheet Detail | Loka Logistics ERP" },
      { property: "og:description", content: "Review a Loka Logistics job from booking through payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JobDetail,
});

const emptyAp = { vendor_id: "", item_cost_description: "", invoice_amount: "", payment_terms_days: "30", payment_type: "Term" };

function JobDetail() {
  const { jobId } = useParams({ from: "/_authenticated/jobs/$jobId" });
  const qc = useQueryClient();
  const { canEditJobs, canEditFinance } = useRoles();
  const [editOpen, setEditOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [apOpen, setApOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [payment, setPayment] = useState<{ kind: "ap" | "ar"; id: string; label: string; balance: number } | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", date: today() });
  const [ap, setAp] = useState(emptyAp);
  const [apFile, setApFile] = useState<File | null>(null);
  const [inv, setInv] = useState({ invoice_no: "", invoice_date: today(), amount: "", terms: "30" });
  const [invFile, setInvFile] = useState<File | null>(null);
  const [edit, setEdit] = useState({ customer_id: "", order_date: today(), service_type: "", unit_type: "", quantity: "", volume_weight: "", origin: "", destination: "" });
  const [closing, setClosing] = useState({ actual_selling: "", actual_buying: "", status: "Completed" });

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*, customers(id, company_name), job_financials(*)").eq("id", jobId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const costsQuery = useQuery({
    queryKey: ["job-ap", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts_payable").select("*, subcontractors_vendors(vendor_name)").eq("job_id", jobId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const invoicesQuery = useQuery({
    queryKey: ["job-ar", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts_receivable").select("*").eq("job_id", jobId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const activityQuery = useQuery({
    queryKey: ["job-activity", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_log").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: async () => { const { data, error } = await supabase.from("customers").select("id, company_name").order("company_name"); if (error) throw error; return data; } });
  const vendorsQuery = useQuery({ queryKey: ["vendors"], queryFn: async () => { const { data, error } = await supabase.from("subcontractors_vendors").select("id, vendor_name").order("vendor_name"); if (error) throw error; return data; } });

  const job = jobQuery.data;
  const financials = job?.job_financials;

  useEffect(() => {
    if (!job) return;
    setEdit({ customer_id: job.customer_id ?? "", order_date: job.order_date, service_type: job.service_type ?? "", unit_type: job.unit_type ?? "", quantity: job.quantity ?? "", volume_weight: job.volume_weight ?? "", origin: job.origin ?? "", destination: job.destination ?? "" });
    setClosing({ actual_selling: String(financials?.actual_selling ?? financials?.estimated_selling ?? 0), actual_buying: String(financials?.actual_buying ?? 0), status: job.status });
  }, [job, financials]);

  const uploadAttachment = async (file: File, folder: "ap" | "ar", recordId: string) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${folder}/${recordId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("finance-attachments").upload(path, file);
    if (uploadError) throw uploadError;
    const table = folder === "ap" ? "accounts_payable" : "accounts_receivable";
    const { error: updateError } = await supabase.from(table).update({ attachment_path: path }).eq("id", recordId);
    if (updateError) throw updateError;
  };

  const downloadAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from("finance-attachments").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const refreshJob = () => {
    qc.invalidateQueries({ queryKey: ["job", jobId] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
    qc.invalidateQueries({ queryKey: ["job-activity", jobId] });
  };

  const editJob = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("update_job_operations", { _job_id: jobId, _customer_id: edit.customer_id, _order_date: edit.order_date, _service_type: edit.service_type, _unit_type: edit.unit_type, _quantity: edit.quantity, _volume_weight: edit.volume_weight, _origin: edit.origin, _destination: edit.destination }); if (error) throw error; },
    onSuccess: () => { toast.success("Job details updated"); setEditOpen(false); refreshJob(); }, onError: (e: Error) => toast.error(e.message),
  });
  const closeJob = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("close_job_financials", { _job_id: jobId, _actual_selling: num(closing.actual_selling), _actual_buying: num(closing.actual_buying), _status: closing.status as "Draft" | "In Progress" | "Completed" | "Cancelled" }); if (error) throw error; },
    onSuccess: () => { toast.success("Job financials updated"); setCloseOpen(false); refreshJob(); }, onError: (e: Error) => toast.error(e.message),
  });
  const addCost = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.from("accounts_payable").insert({ job_id: jobId, vendor_id: ap.vendor_id || null, item_cost_description: ap.item_cost_description, invoice_amount: num(ap.invoice_amount), payment_terms_days: Number(ap.payment_terms_days || 0), due_date: addDays(today(), Number(ap.payment_terms_days || 0)), payment_type: ap.payment_type as "Term" | "Cash" }).select("id").single(); if (error) throw error; if (apFile) await uploadAttachment(apFile, "ap", data.id); },
    onSuccess: () => { toast.success("Vendor cost logged"); setApOpen(false); setAp(emptyAp); setApFile(null); qc.invalidateQueries({ queryKey: ["job-ap", jobId] }); qc.invalidateQueries({ queryKey: ["job-activity", jobId] }); }, onError: (e: Error) => toast.error(e.message),
  });
  const issueInvoice = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.from("accounts_receivable").insert({ invoice_no: inv.invoice_no, job_id: jobId, customer_id: job?.customer_id ?? null, invoice_date: inv.invoice_date, amount: num(inv.amount || financials?.actual_selling), payment_terms_days: Number(inv.terms || 0), due_date: addDays(inv.invoice_date, Number(inv.terms || 0)), status: "Issued" }).select("id").single(); if (error) throw error; if (invFile) await uploadAttachment(invFile, "ar", data.id); },
    onSuccess: () => { toast.success("Invoice issued"); setInvOpen(false); setInvFile(null); qc.invalidateQueries({ queryKey: ["job-ar", jobId] }); qc.invalidateQueries({ queryKey: ["job-activity", jobId] }); }, onError: (e: Error) => toast.error(e.message),
  });
  const recordPayment = useMutation({
    mutationFn: async () => { if (!payment) return; const args = { _payment_date: paymentForm.date, _amount: num(paymentForm.amount) }; const result = payment.kind === "ap" ? await supabase.rpc("record_ap_payment", { ...args, _ap_id: payment.id }) : await supabase.rpc("record_ar_payment", { ...args, _ar_id: payment.id }); if (result.error) throw result.error; },
    onSuccess: () => { toast.success("Payment recorded"); setPayment(null); setPaymentForm({ amount: "", date: today() }); qc.invalidateQueries({ queryKey: ["job-ap", jobId] }); qc.invalidateQueries({ queryKey: ["job-ar", jobId] }); qc.invalidateQueries({ queryKey: ["job-activity", jobId] }); qc.invalidateQueries({ queryKey: ["payments"] }); }, onError: (e: Error) => toast.error(e.message),
  });

  if (jobQuery.isLoading) return <p className="text-muted-foreground">Loading job sheet…</p>;
  if (!job) return <p className="text-muted-foreground">Job sheet not found.</p>;
  const costs = costsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const totalCost = costs.reduce((sum, cost) => sum + num(cost.invoice_amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold">Job {job.job_sheet_no}</h1><p className="text-sm text-muted-foreground">{job.customers?.company_name ?? "No customer"} · {job.origin || "?"} → {job.destination || "?"}</p></div>
        <div className="flex flex-wrap gap-2"><StatusBadge status={job.status} />{canEditJobs && job.status !== "Completed" && job.status !== "Cancelled" && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit details</Button>}{canEditFinance && <Button onClick={() => setCloseOpen(true)}>Update financials</Button>}</div>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Operational details</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Order date" value={fmtDate(job.order_date)} /><Detail label="Service" value={job.service_type} /><Detail label="Unit" value={job.unit_type} /><Detail label="Quantity" value={job.quantity} /><Detail label="Volume / weight" value={job.volume_weight} /><Detail label="Origin" value={job.origin} /><Detail label="Destination" value={job.destination} /><Detail label="Status" value={job.status} /></CardContent></Card>

      {canEditFinance && <Card><CardHeader><CardTitle className="text-base">Estimated vs actual</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Measure</TableHead><TableHead className="text-right">Estimated</TableHead><TableHead className="text-right">Actual</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Selling</TableCell><TableCell className="text-right">{idr(financials?.estimated_selling)}</TableCell><TableCell className="text-right">{idr(financials?.actual_selling)}</TableCell></TableRow><TableRow><TableCell>Buying</TableCell><TableCell className="text-right">{idr(financials?.estimated_buying)}</TableCell><TableCell className="text-right">{idr(financials?.actual_buying || totalCost)}</TableCell></TableRow><TableRow><TableCell>Margin</TableCell><TableCell className="text-right">{idr(num(financials?.estimated_selling) - num(financials?.estimated_buying))}</TableCell><TableCell className="text-right font-medium">{idr(financials?.margin)} ({pct(num(financials?.pct_margin))})</TableCell></TableRow></TableBody></Table></CardContent></Card>}

      <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-base">AP — Vendor costs</CardTitle><CardDescription>{costs.length} cost lines</CardDescription></div>{canEditJobs && <Button size="sm" variant="outline" onClick={() => setApOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add cost</Button>}</CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Description</TableHead><TableHead>Due / overdue</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Document</TableHead><TableHead /></TableRow></TableHeader><TableBody>{costs.map((cost) => { const balance = num(cost.balance_remaining); const days = daysUntil(cost.due_date); return <TableRow key={cost.id}><TableCell>{cost.subcontractors_vendors?.vendor_name ?? "-"}</TableCell><TableCell>{cost.item_cost_description}</TableCell><TableCell>{fmtDate(cost.due_date)}{balance > 0 && <span className="ml-2 text-xs text-muted-foreground">{days < 0 ? `${Math.abs(days)}d late` : `in ${days}d`}</span>}</TableCell><TableCell className="text-right">{idr(cost.invoice_amount)}</TableCell><TableCell className="text-right">{idr(cost.paid_amount)}</TableCell><TableCell className="text-right">{idr(balance)}</TableCell><TableCell>{cost.attachment_path ? <Button size="icon" variant="ghost" title="Download attachment" onClick={() => downloadAttachment(cost.attachment_path ?? "")}><Download className="h-4 w-4" /></Button> : "—"}</TableCell><TableCell>{canEditFinance && balance > 0 && <Button size="sm" variant="outline" onClick={() => setPayment({ kind: "ap", id: cost.id, label: cost.item_cost_description ?? "vendor cost", balance })}><Banknote className="mr-1 h-4 w-4" /> Record payment</Button>}</TableCell></TableRow>; })}{costs.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No vendor costs logged yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>

      <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-base">AR — Invoices</CardTitle><CardDescription>Customer invoices linked to this job</CardDescription></div>{canEditFinance && <Button size="sm" disabled={job.status !== "Completed"} onClick={() => setInvOpen(true)}><FileText className="mr-2 h-4 w-4" /> Issue invoice</Button>}</CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Due / overdue</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Document</TableHead><TableHead /></TableRow></TableHeader><TableBody>{invoices.map((invoice) => { const balance = num(invoice.remaining_amount); const days = daysUntil(invoice.due_date); return <TableRow key={invoice.id}><TableCell className="font-medium">{invoice.invoice_no}</TableCell><TableCell>{fmtDate(invoice.invoice_date)}</TableCell><TableCell>{fmtDate(invoice.due_date)}{balance > 0 && <span className="ml-2 text-xs text-muted-foreground">{days < 0 ? `${Math.abs(days)}d late` : `in ${days}d`}</span>}</TableCell><TableCell className="text-right">{idr(invoice.amount)}</TableCell><TableCell className="text-right">{idr(invoice.paid_amount)}</TableCell><TableCell className="text-right">{idr(balance)}</TableCell><TableCell>{invoice.attachment_path ? <Button size="icon" variant="ghost" title="Download attachment" onClick={() => downloadAttachment(invoice.attachment_path ?? "")}><Download className="h-4 w-4" /></Button> : "—"}</TableCell><TableCell>{canEditFinance && balance > 0 && <Button size="sm" variant="outline" onClick={() => setPayment({ kind: "ar", id: invoice.id, label: invoice.invoice_no, balance })}><Banknote className="mr-1 h-4 w-4" /> Record payment</Button>}</TableCell></TableRow>; })}{invoices.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No invoice issued yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Activity history</CardTitle></CardHeader><CardContent><div className="space-y-4">{(activityQuery.data ?? []).map((event) => <div key={event.id} className="border-l-2 border-border pl-4"><p className="text-sm font-medium">{event.description}</p><p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("en-GB")} · {event.action.replaceAll("_", " ")}</p></div>)}{(activityQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}</div></CardContent></Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Edit operational details</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Customer</Label><Select value={edit.customer_id} onValueChange={(value) => setEdit({ ...edit, customer_id: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(customersQuery.data ?? []).map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.company_name}</SelectItem>)}</SelectContent></Select></div><Field label="Order date" type="date" value={edit.order_date} onChange={(value) => setEdit({ ...edit, order_date: value })} /><Field label="Service type" value={edit.service_type} onChange={(value) => setEdit({ ...edit, service_type: value })} /><Field label="Unit type" value={edit.unit_type} onChange={(value) => setEdit({ ...edit, unit_type: value })} /><Field label="Quantity" value={edit.quantity} onChange={(value) => setEdit({ ...edit, quantity: value })} /><Field label="Volume / weight" value={edit.volume_weight} onChange={(value) => setEdit({ ...edit, volume_weight: value })} /><Field label="Origin" value={edit.origin} onChange={(value) => setEdit({ ...edit, origin: value })} /><Field label="Destination" value={edit.destination} onChange={(value) => setEdit({ ...edit, destination: value })} /></div><DialogFooter><Button onClick={() => editJob.mutate()} disabled={editJob.isPending}>Save changes</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}><DialogContent><DialogHeader><DialogTitle>Update job financials</DialogTitle></DialogHeader><div className="space-y-4"><Field label="Actual selling (IDR)" type="number" value={closing.actual_selling} onChange={(value) => setClosing({ ...closing, actual_selling: value })} /><Field label="Actual buying (IDR)" type="number" value={closing.actual_buying} onChange={(value) => setClosing({ ...closing, actual_buying: value })} /><div className="space-y-2"><Label>Status</Label><Select value={closing.status} onValueChange={(value) => setClosing({ ...closing, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Draft", "In Progress", "Completed", "Cancelled"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button onClick={() => closeJob.mutate()} disabled={closeJob.isPending}>Save financials</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={apOpen} onOpenChange={setApOpen}><DialogContent><DialogHeader><DialogTitle>Log vendor cost</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Vendor</Label><Select value={ap.vendor_id} onValueChange={(value) => setAp({ ...ap, vendor_id: value })}><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent>{(vendorsQuery.data ?? []).map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.vendor_name}</SelectItem>)}</SelectContent></Select></div><Field label="Cost description" value={ap.item_cost_description} onChange={(value) => setAp({ ...ap, item_cost_description: value })} /><Field label="Invoice amount (IDR)" type="number" value={ap.invoice_amount} onChange={(value) => setAp({ ...ap, invoice_amount: value })} /><Field label="TOP (days)" type="number" value={ap.payment_terms_days} onChange={(value) => setAp({ ...ap, payment_terms_days: value })} /><div className="space-y-2"><Label>Vendor invoice (PDF or image)</Label><Input type="file" accept="application/pdf,image/*" onChange={(event) => setApFile(event.target.files?.[0] ?? null)} /></div></div><DialogFooter><Button onClick={() => addCost.mutate()} disabled={!ap.invoice_amount || addCost.isPending}>Save cost line</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={invOpen} onOpenChange={setInvOpen}><DialogContent><DialogHeader><DialogTitle>Issue invoice</DialogTitle></DialogHeader><div className="space-y-4"><Field label="Invoice no." value={inv.invoice_no} onChange={(value) => setInv({ ...inv, invoice_no: value })} /><Field label="Invoice date" type="date" value={inv.invoice_date} onChange={(value) => setInv({ ...inv, invoice_date: value })} /><Field label="TOP (days)" type="number" value={inv.terms} onChange={(value) => setInv({ ...inv, terms: value })} /><Field label="Amount (IDR)" type="number" value={inv.amount} onChange={(value) => setInv({ ...inv, amount: value })} /><div className="space-y-2"><Label>Invoice or BAST (PDF or image)</Label><Input type="file" accept="application/pdf,image/*" onChange={(event) => setInvFile(event.target.files?.[0] ?? null)} /></div></div><DialogFooter><Button onClick={() => issueInvoice.mutate()} disabled={!inv.invoice_no || issueInvoice.isPending}>Issue invoice</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!payment} onOpenChange={(open) => !open && setPayment(null)}><DialogContent><DialogHeader><DialogTitle>Record payment · {payment?.label}</DialogTitle></DialogHeader><div className="space-y-4"><Field label={`Amount (balance ${idr(payment?.balance)})`} type="number" value={paymentForm.amount} onChange={(value) => setPaymentForm({ ...paymentForm, amount: value })} /><Field label="Date" type="date" value={paymentForm.date} onChange={(value) => setPaymentForm({ ...paymentForm, date: value })} /></div><DialogFooter><Button onClick={() => recordPayment.mutate()} disabled={!paymentForm.amount || recordPayment.isPending}>Record payment</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value || "—"}</p></div>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }