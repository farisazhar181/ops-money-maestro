import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useParams } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import logoAsset from "@/assets/logo-logis.jpg.asset.json";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, idr, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId/print")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw redirect({ to: "/auth" });

    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error || !roles?.some(({ role }) => role === "owner" || role === "finance")) {
      throw redirect({ to: "/jobs" });
    }
  },
  head: () => ({
    meta: [
      { title: "Print Customer Invoice | Loka Logistics ERP" },
      {
        name: "description",
        content: "Print-ready customer invoice for PT. Loka Logistics Solution.",
      },
      { property: "og:title", content: "Print Customer Invoice | Loka Logistics ERP" },
      {
        property: "og:description",
        content: "Print-ready customer invoice for PT. Loka Logistics Solution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrintableInvoicePage,
});

function PrintableInvoicePage() {
  const { invoiceId } = useParams({ from: "/_authenticated/invoices/$invoiceId/print" });
  const invoiceQuery = useQuery({
    queryKey: ["print-invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select(
          "*, customers(company_name, contact_name, address), jobs(job_sheet_no, service_type, commodity, origin, destination, quantity, volume_weight)",
        )
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (invoiceQuery.isLoading) return <p className="text-muted-foreground">Loading invoice…</p>;
  const invoice = invoiceQuery.data;
  if (!invoice) return <p className="text-muted-foreground">Invoice not found.</p>;

  const paid = num(invoice.paid_amount);
  const balance = num(invoice.remaining_amount);
  const isPaid = !invoice.is_void && balance <= 0;

  return (
    <div className="invoice-print-page -m-4 md:-m-6">
      <div className="no-print mx-auto flex w-full max-w-[210mm] items-center justify-between px-4 py-4">
        <Button variant="outline" asChild>
          <Link to="/receivables">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Receivables
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print invoice
        </Button>
      </div>

      <article className="invoice-sheet relative mx-auto overflow-hidden bg-invoice-paper text-invoice-ink">
        {invoice.is_void && <div className="invoice-watermark">VOID</div>}
        <header className="invoice-letterhead flex items-start justify-between gap-8 border-b border-invoice-rule pb-6">
          <div>
            <img src={logoAsset.url} alt="LOGIS" className="h-auto w-52" />
            <h1 className="mt-4 text-lg font-semibold">PT. Loka Logistics Solution</h1>
            <div className="mt-2 space-y-1 text-xs text-invoice-muted">
              <p>[company address]</p>
              <p>[phone] · [email]</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-semibold">INVOICE</p>
            {isPaid && (
              <span className="mt-3 inline-block border-2 border-invoice-paid px-3 py-1 text-sm font-bold text-invoice-paid">
                PAID
              </span>
            )}
          </div>
        </header>

        <section className="mt-7 grid grid-cols-2 gap-10 text-sm">
          <div>
            <p className="invoice-label">Bill to</p>
            <p className="mt-2 text-base font-semibold">{invoice.customers?.company_name ?? "—"}</p>
            <p className="mt-1">{invoice.customers?.contact_name ?? "—"}</p>
            <p className="mt-1 whitespace-pre-line text-invoice-muted">
              {invoice.customers?.address ?? "—"}
            </p>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2">
            <dt className="text-invoice-muted">Invoice number</dt>
            <dd className="font-medium">{invoice.invoice_no}</dd>
            <dt className="text-invoice-muted">Invoice date</dt>
            <dd>{fmtDate(invoice.invoice_date)}</dd>
            <dt className="text-invoice-muted">Due date</dt>
            <dd>{fmtDate(invoice.due_date)}</dd>
            <dt className="text-invoice-muted">Payment terms</dt>
            <dd>{invoice.payment_terms_days} days</dd>
          </dl>
        </section>

        <section className="mt-8 border-y border-invoice-rule py-5">
          <p className="invoice-label">Job reference</p>
          <div className="mt-3 grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
            <InvoiceDetail label="Job sheet" value={invoice.jobs?.job_sheet_no} />
            <InvoiceDetail label="Service type" value={invoice.jobs?.service_type} />
            <InvoiceDetail label="Commodity" value={invoice.jobs?.commodity} />
            <InvoiceDetail
              label="Route"
              value={`${invoice.jobs?.origin || "—"} → ${invoice.jobs?.destination || "—"}`}
            />
            <InvoiceDetail label="Quantity" value={invoice.jobs?.quantity} />
            <InvoiceDetail label="Volume / weight" value={invoice.jobs?.volume_weight} />
          </div>
        </section>

        <section className="mt-8">
          <div className="grid grid-cols-[1fr_auto] border-b border-invoice-rule pb-2 text-xs font-semibold uppercase text-invoice-muted">
            <span>Description</span>
            <span>Amount</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] py-5 text-sm">
            <span>Logistics services · {invoice.jobs?.job_sheet_no ?? "Job"}</span>
            <span className="font-medium">{idr(invoice.amount)}</span>
          </div>
          <div className="ml-auto w-72 border-t border-invoice-rule pt-3 text-sm">
            <InvoiceAmount label="Total" value={invoice.amount} strong />
            <InvoiceAmount label="Amount received" value={paid} />
            <InvoiceAmount label="Balance due" value={balance} strong />
          </div>
        </section>

        <section className="mt-10 grid grid-cols-2 gap-12 text-sm">
          <div>
            <p className="invoice-label">Payment instructions</p>
            <p className="mt-3">[bank name]</p>
            <p className="mt-1">[account number and account holder name]</p>
          </div>
          <div className="pt-12 text-center">
            <div className="border-t border-invoice-rule pt-2">Finance</div>
            <p className="mt-1 text-xs text-invoice-muted">PT. Loka Logistics Solution</p>
          </div>
        </section>
      </article>
    </div>
  );
}

function InvoiceDetail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-invoice-muted">{label}</p>
      <p className="mt-1 font-medium">{value || "—"}</p>
    </div>
  );
}

function InvoiceAmount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number | string | null;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-6 py-1 ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{idr(value)}</span>
    </div>
  );
}
