import { useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StatusBadge } from "@/components/status-badge";
import { idr, fmtDate, today, numOrNull } from "@/lib/format";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Job Sheets | Loka Logistics ERP" },
      {
        name: "description",
        content:
          "Create and track shipment job sheets, routes, selling prices and vendor cost estimates.",
      },
      { property: "og:title", content: "Job Sheets | Loka Logistics ERP" },
      { property: "og:description", content: "Operational job sheet pipeline for Loka Logistics." },
    ],
  }),
  component: JobsPage,
});

const empty = {
  job_sheet_no: "",
  customer_id: "",
  order_date: today(),
  service_type: "Trucking",
  unit_type: "",
  quantity: "",
  volume_weight: "",
  origin: "",
  destination: "",
  commodity: "",
  etd: "",
  eta: "",
  selling_price: "",
  buying_price_est: "",
};

function JobsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { canEditJobs, canEditFinance } = useRoles();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState<string>("all");

  const { data: jobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, customers(company_name), job_financials(estimated_selling, estimated_buying)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, company_name")
        .order("company_name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_job", {
        _job_sheet_no: form.job_sheet_no,
        _customer_id: form.customer_id || (null as unknown as string),
        _order_date: form.order_date,
        _service_type: form.service_type,
        _unit_type: form.unit_type,
        _quantity: form.quantity,
        _volume_weight: form.volume_weight,
        _origin: form.origin,
        _destination: form.destination,
        _commodity: form.commodity,
        _etd: form.etd || (null as unknown as string),
        _eta: form.eta || (null as unknown as string),
        ...(canEditFinance
          ? {
              _estimated_selling: numOrNull(form.selling_price) ?? 0,
              _estimated_buying: numOrNull(form.buying_price_est) ?? 0,
            }
          : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job sheet created");
      setOpen(false);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (jobs ?? []).filter((j) => filter === "all" || j.status === filter);

  if (pathname !== "/jobs" && pathname !== "/jobs/") return <Outlet />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Job Sheets</h1>
          <p className="text-sm text-muted-foreground">
            Step 1 of the workflow — book the shipment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Pipeline">Pipeline</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          {canEditJobs && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New job sheet
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>New job sheet</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Job sheet no."
                    value={form.job_sheet_no}
                    onChange={(v) => setForm({ ...form, job_sheet_no: v })}
                    placeholder="001/05/26"
                  />
                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <Select
                      value={form.customer_id}
                      onValueChange={(v) => setForm({ ...form, customer_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {(customers ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field
                    label="Order date"
                    type="date"
                    value={form.order_date}
                    onChange={(v) => setForm({ ...form, order_date: v })}
                  />
                  <Field
                    label="Service type"
                    value={form.service_type}
                    onChange={(v) => setForm({ ...form, service_type: v })}
                    placeholder="Trucking / Ocean freight"
                  />
                  <Field
                    label="Unit type"
                    value={form.unit_type}
                    onChange={(v) => setForm({ ...form, unit_type: v })}
                    placeholder="1 FUSO, 1 CDD, LCL"
                  />
                  <Field
                    label="Quantity"
                    value={form.quantity}
                    onChange={(v) => setForm({ ...form, quantity: v })}
                    placeholder="2 Colly"
                  />
                  <Field
                    label="Volume / weight"
                    value={form.volume_weight}
                    onChange={(v) => setForm({ ...form, volume_weight: v })}
                    placeholder="6000 Kg"
                  />
                  <Field
                    label="Origin"
                    value={form.origin}
                    onChange={(v) => setForm({ ...form, origin: v })}
                  />
                  <Field
                    label="Destination"
                    value={form.destination}
                    onChange={(v) => setForm({ ...form, destination: v })}
                  />
                  <Field
                    label="Commodity / cargo description"
                    value={form.commodity}
                    onChange={(v) => setForm({ ...form, commodity: v })}
                    placeholder="e.g. Electronics, garments"
                  />
                  <Field
                    label="ETD (est. departure)"
                    type="date"
                    value={form.etd}
                    onChange={(v) => setForm({ ...form, etd: v })}
                  />
                  <Field
                    label="ETA (est. arrival)"
                    type="date"
                    value={form.eta}
                    onChange={(v) => setForm({ ...form, eta: v })}
                  />
                  {canEditFinance && (
                    <Field
                      label="Estimated selling (IDR) — required"
                      type="money"
                      value={form.selling_price}
                      onChange={(v) => setForm({ ...form, selling_price: v })}
                    />
                  )}
                  {canEditFinance && (
                    <Field
                      label="Estimated buying (IDR) — required"
                      type="money"
                      value={form.buying_price_est}
                      onChange={(v) => setForm({ ...form, buying_price_est: v })}
                    />
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => create.mutate()}
                    disabled={
                      !form.job_sheet_no ||
                      (canEditFinance &&
                        ((numOrNull(form.selling_price) ?? 0) <= 0 ||
                          (numOrNull(form.buying_price_est) ?? 0) <= 0)) ||
                      create.isPending
                    }
                  >
                    Create job sheet
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filter === "all" ? "All job sheets" : filter} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job sheet</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Commodity</TableHead>
                <TableHead>ETD</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Order date</TableHead>
                <TableHead className="text-right">Selling</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((j) => (
                <TableRow
                  key={j.id}
                  className={j.is_void ? "cursor-pointer opacity-50" : "cursor-pointer"}
                  tabIndex={0}
                  onClick={() => navigate({ to: "/jobs/$jobId", params: { jobId: j.id } })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      navigate({ to: "/jobs/$jobId", params: { jobId: j.id } });
                  }}
                >
                  <TableCell className="font-medium">{j.job_sheet_no}</TableCell>
                  <TableCell>{j.customers?.company_name ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {j.origin || "?"} → {j.destination || "?"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{j.commodity || "—"}</TableCell>
                  <TableCell>{fmtDate(j.etd)}</TableCell>
                  <TableCell>{fmtDate(j.eta)}</TableCell>
                  <TableCell>{fmtDate(j.order_date)}</TableCell>
                  <TableCell className="text-right">
                    {j.job_financials ? idr(j.job_financials.estimated_selling) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {j.job_financials ? idr(j.job_financials.estimated_buying) : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={j.is_void ? "Voided" : j.status} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">Open</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    No job sheets yet.
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  if (type === "money")
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <MoneyInput value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    );
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
