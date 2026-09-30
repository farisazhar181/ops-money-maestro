import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { idr, num, today } from "@/lib/format";
import { rangeFor } from "@/lib/statistics";

export const Route = createFileRoute("/_authenticated/statistics")({
  head: () => ({
    meta: [
      { title: "Statistics | Loka Logistics ERP" },
      { name: "description", content: "Revenue, margin, cash flow, aging and job volume trends." },
      { property: "og:title", content: "Statistics | Loka Logistics ERP" },
      { property: "og:description", content: "Financial trends for PT. Loka Logistics Solution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatisticsPage,
});

const BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"];

const compact = (v: number) =>
  new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const monthLabel = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

const cfg = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  margin: { label: "Margin %", color: "var(--chart-2)" },
  cashIn: { label: "Cash in", color: "var(--chart-2)" },
  cashOut: { label: "Cash out", color: "var(--chart-5)" },
  receivables: { label: "Receivables", color: "var(--chart-1)" },
  liabilities: { label: "Liabilities", color: "var(--chart-4)" },
  balance: { label: "Balance", color: "var(--chart-3)" },
  liquidity: { label: "Liquidity Ratio", color: "var(--chart-3)" },
  total: { label: "Total", color: "var(--chart-1)" },
  jobsCreated: { label: "Jobs created", color: "var(--chart-3)" },
  jobsClosed: { label: "Jobs closed", color: "var(--chart-2)" },
} satisfies ChartConfig;

function StatisticsPage() {
  const { canSeeExecutive, loading } = useRoles();
  const [months, setMonths] = useState(12);
  const { from, to } = rangeFor(months, today());

  const { data, isLoading, error } = useQuery({
    queryKey: ["statistics", from, to],
    enabled: canSeeExecutive,
    queryFn: async () => {
      const r = await Promise.all([
        supabase.rpc("report_monthly", { _from: from, _to: to }),
        supabase.rpc("report_balances", { _from: from, _to: to }),
        supabase.rpc("report_aging", { _kind: "ar" }),
        supabase.rpc("report_aging", { _kind: "ap" }),
        supabase.rpc("report_top_parties", { _kind: "customers", _from: from, _to: to, _limit: 5 }),
        supabase.rpc("report_top_parties", { _kind: "vendors", _from: from, _to: to, _limit: 5 }),
      ]);
      const err = r.find((x) => x.error)?.error;
      if (err) throw err;
      return {
        monthly: r[0].data ?? [],
        balances: r[1].data ?? [],
        ar: r[2].data ?? [],
        ap: r[3].data ?? [],
        customers: r[4].data ?? [],
        vendors: r[5].data ?? [],
      };
    },
  });

  if (loading) return <p className="text-muted-foreground">Checking access…</p>;
  if (!canSeeExecutive) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" /> Restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Statistics are available to Owner and Finance roles only.
        </CardContent>
      </Card>
    );
  }

  const monthly = (data?.monthly ?? []).map((r) => ({
    month: monthLabel(r.month),
    revenue: num(r.revenue),
    margin:
      num(r.closed_selling) > 0
        ? Number(((num(r.closed_margin) / num(r.closed_selling)) * 100).toFixed(1))
        : null,
    cashIn: num(r.op_cash_in),
    cashOut: num(r.op_cash_out),
    jobsCreated: Number(r.jobs_created ?? 0),
    jobsClosed: Number(r.closed_jobs ?? 0),
  }));
  const balances = (data?.balances ?? []).map((r) => ({
    month: monthLabel(r.month),
    receivables: num(r.ar_outstanding),
    liabilities: num(r.ap_outstanding),
    liquidity: r.liquidity_ratio == null ? null : num(r.liquidity_ratio),
  }));
  const aging = (rows: { bucket: string; balance: number | null }[]) =>
    BUCKETS.map((b) => ({
      bucket: b,
      balance: rows.filter((r) => r.bucket === b).reduce((s, r) => s + num(r.balance), 0),
    }));
  const ranked = (rows: { party: string; total: number | null }[]) =>
    rows.map((r) => ({ party: r.party, total: num(r.total) }));

  const money = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          formatter={(v, n) => (
            <span>
              {cfg[n as keyof typeof cfg]?.label ?? n}: {idr(Number(v))}
            </span>
          )}
        />
      }
    />
  );
  const xAxis = <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />;
  const yMoney = (
    <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} width={48} />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Statistics</h1>
          <p className="text-sm text-muted-foreground">
            Same figures as the Dashboard and Reports. Voided entries are excluded.
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={String(months)}
          onValueChange={(v) => v && setMonths(Number(v))}
          aria-label="Range"
        >
          {[6, 12, 24].map((m) => (
            <ToggleGroupItem key={m} value={String(m)} aria-label={`${m} months`}>
              {m}M
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Revenue trend" desc="Invoiced revenue by invoice month">
            <AreaChart data={monthly}>
              <CartesianGrid vertical={false} />
              {xAxis}
              {yMoney}
              {money}
              <Area
                dataKey="revenue"
                type="monotone"
                fill="var(--color-revenue)"
                fillOpacity={0.25}
                stroke="var(--color-revenue)"
              />
            </AreaChart>
          </ChartCard>
          <ChartCard title="Margin %" desc="Job margin of jobs closed in the month">
            <LineChart data={monthly}>
              <CartesianGrid vertical={false} />
              {xAxis}
              <YAxis unit="%" tickLine={false} axisLine={false} fontSize={11} width={48} />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(v) => <span>Margin: {v}%</span>} />}
              />
              <Line
                dataKey="margin"
                type="monotone"
                stroke="var(--color-margin)"
                strokeWidth={2}
                connectNulls
                dot
              />
            </LineChart>
          </ChartCard>
          <ChartCard
            title="Operating cash in vs. out"
            desc="Receipts vs. vendor and overhead payments; investor money excluded"
          >
            <BarChart data={monthly}>
              <CartesianGrid vertical={false} />
              {xAxis}
              {yMoney}
              {money}
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="cashIn" fill="var(--color-cashIn)" radius={3} />
              <Bar dataKey="cashOut" fill="var(--color-cashOut)" radius={3} />
            </BarChart>
          </ChartCard>
          <ChartCard
            title="Liabilities vs. receivables"
            desc="Outstanding balances at each month-end"
          >
            <LineChart data={balances}>
              <CartesianGrid vertical={false} />
              {xAxis}
              {yMoney}
              {money}
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="receivables"
                type="monotone"
                stroke="var(--color-receivables)"
                strokeWidth={2}
              />
              <Line
                dataKey="liabilities"
                type="monotone"
                stroke="var(--color-liabilities)"
                strokeWidth={2}
              />
            </LineChart>
          </ChartCard>
          <ChartCard
            title="Liquidity Ratio"
            desc="(Cash position + receivables) ÷ payables at each month-end"
          >
            <LineChart data={balances}>
              <CartesianGrid vertical={false} />
              {xAxis}
              <YAxis
                tickFormatter={(v) => `${Number(v).toFixed(1)}x`}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={48}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(v) => (
                      <span>Liquidity: {v == null ? "—" : `${Number(v).toFixed(2)}x`}</span>
                    )}
                  />
                }
              />
              <Line
                dataKey="liquidity"
                type="monotone"
                stroke="var(--color-liquidity)"
                strokeWidth={2}
                connectNulls
              />
            </LineChart>
          </ChartCard>
          <ChartCard title="AR aging" desc="Unpaid receivable balance by days overdue (today)">
            <BarChart data={aging(data?.ar ?? [])}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
              {yMoney}
              {money}
              <Bar dataKey="balance" fill="var(--color-balance)" radius={3} />
            </BarChart>
          </ChartCard>
          <ChartCard title="AP aging" desc="Unpaid payable balance by days overdue (today)">
            <BarChart data={aging(data?.ap ?? [])}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
              {yMoney}
              {money}
              <Bar dataKey="balance" fill="var(--color-liabilities)" radius={3} />
            </BarChart>
          </ChartCard>
          <RankCard
            title="Top 5 customers by revenue"
            rows={ranked(data?.customers ?? [])}
            money={money}
          />
          <RankCard
            title="Top 5 vendors by cost"
            rows={ranked(data?.vendors ?? [])}
            money={money}
          />
          <ChartCard
            title="Job volume"
            desc="Jobs created and closed per month"
            className="lg:col-span-2"
          >
            <BarChart data={monthly}>
              <CartesianGrid vertical={false} />
              {xAxis}
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={32}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="jobsCreated" fill="var(--color-jobsCreated)" radius={3} />
              <Bar dataKey="jobsClosed" fill="var(--color-jobsClosed)" radius={3} />
            </BarChart>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  desc,
  children,
  className,
}: {
  title: string;
  desc: string;
  children: React.ReactElement;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={cfg} className="aspect-auto h-64 w-full">
          {children}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function RankCard({
  title,
  rows,
  money,
}: {
  title: string;
  rows: { party: string; total: number }[];
  money: React.ReactNode;
}) {
  return (
    <ChartCard title={title} desc="Selected period, voided entries excluded">
      {rows.length === 0 ? (
        ((
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data in this period
          </div>
        ) as unknown as React.ReactElement)
      ) : (
        <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <YAxis
            type="category"
            dataKey="party"
            width={110}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          {money}
          <Bar dataKey="total" fill="var(--color-total)" radius={3} />
        </BarChart>
      )}
    </ChartCard>
  );
}
