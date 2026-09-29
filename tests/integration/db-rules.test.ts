/**
 * Runs against the live backend. Requires:
 *   TEST_OWNER_TOKEN, TEST_FINANCE_EMAIL, TEST_OPS_EMAIL, TEST_PASSWORD
 * Every row created here is labelled "TEST" and voided or deleted afterwards.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { jakartaDate } from "@/lib/format";

const URL = "https://xwxtvdhfsjsotskyogyf.supabase.co";
const KEY = "sb_publishable_b200cDEnyBjb39jbSiQJUw_MTrjCxeD";
const env = process.env;
const enabled = !!(
  env.TEST_OWNER_TOKEN &&
  env.TEST_FINANCE_EMAIL &&
  env.TEST_OPS_EMAIL &&
  env.TEST_PASSWORD
);
type DB = SupabaseClient<Database>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function signIn(email: string): Promise<DB> {
  const c = createClient<Database>(URL, KEY, opts);
  const { error } = await c.auth.signInWithPassword({ email, password: env.TEST_PASSWORD! });
  if (error) throw error;
  return c;
}
const today = jakartaDate();
const yesterday = jakartaDate(new Date(Date.now() - 86400000));

describe.skipIf(!enabled)("database rules", () => {
  let owner: DB, finance: DB, ops: DB;
  const summary = async () => {
    const { data, error } = await finance.rpc("report_summary");
    if (error) throw error;
    return data![0]!;
  };
  const month = async () => {
    const { data, error } = await finance.rpc("report_monthly", { _from: today, _to: today });
    if (error) throw error;
    return data![0]!;
  };

  beforeAll(async () => {
    owner = createClient<Database>(URL, KEY, {
      ...opts,
      global: { headers: { Authorization: `Bearer ${env.TEST_OWNER_TOKEN}` } },
    });
    finance = await signIn(env.TEST_FINANCE_EMAIL!);
    ops = await signIn(env.TEST_OPS_EMAIL!);
  });

  it("Operations cannot read dashboard or report figures", async () => {
    for (const call of [
      ops.rpc("report_summary"),
      ops.rpc("report_aging", { _kind: "ar" }),
      ops.rpc("report_monthly", { _from: today, _to: today }),
    ]) {
      const { error } = await call;
      expect(error?.message).toMatch(/Not authorized/);
    }
  });

  it("Finance can create and edit customers and vendors; referenced ones cannot be deleted", async () => {
    const c = await finance.rpc("save_customer", { _id: null as unknown as string, _company_name: "TEST customer", _contact_name: "", _phone: "", _email: "", _address: "" });
    expect(c.error).toBeNull();
    const u = await finance.rpc("save_customer", { _id: c.data!.id, _company_name: "TEST customer", _contact_name: "", _phone: "000", _email: "", _address: "" });
    expect(u.error).toBeNull();
    expect(u.data!.phone).toBe("000");
    const v = await finance.rpc("save_vendor", { _id: null as unknown as string, _vendor_name: "TEST vendor", _service_type: "", _contact_person: "", _phone: "" });
    expect(v.error).toBeNull();
    expect((await owner.from("customers").delete().eq("id", c.data!.id)).error).toBeNull();
    expect(
      (await owner.from("subcontractors_vendors").delete().eq("id", v.data!.id)).error,
    ).toBeNull();
    const used = await owner
      .from("jobs")
      .select("customer_id")
      .not("customer_id", "is", null)
      .limit(1)
      .single();
    const del = await owner.from("customers").delete().eq("id", used.data!.customer_id!);
    expect(del.error?.message).toMatch(/foreign key|violates/i);
  });

  it("Pipeline estimates stay out of revenue/P&L; closing with blank or zero actuals is rejected", async () => {
    const before = await month();
    const beforeSummary = await summary();
    const job = await ops.rpc("create_job", { _job_sheet_no: `TEST-${Date.now()}`, _customer_id: null as unknown as string, _order_date: today, _service_type: "", _unit_type: "", _quantity: "", _volume_weight: "", _origin: "", _destination: "" });
    expect(job.error).toBeNull();
    const fin = await finance.rpc("set_job_estimates", { _job_id: job.data!.id, _estimated_selling: 777000000, _estimated_buying: 1 });
    expect(fin.error).toBeNull();
    const after = await month();
    expect(num(after.revenue)).toBe(num(before.revenue));
    expect(num(after.net_profit)).toBe(num(before.net_profit));
    expect(num((await summary()).pipeline_value) - num(beforeSummary.pipeline_value)).toBe(
      777000000,
    );

    for (const [s, b] of [
      [null, 100],
      [100, null],
      [0, 100],
      [100, 0],
    ] as const) {
      const r = await finance.rpc("close_job_financials", {
        _job_id: job.data!.id,
        _actual_selling: s as number,
        _actual_buying: b as number,
        _status: "Closed",
      });
      expect(r.error?.message).toMatch(/greater than zero/);
    }
    const jobRow = await finance.from("jobs").select("status").eq("id", job.data!.id).single();
    expect(jobRow.data!.status).toBe("Pipeline");
    expect(
      (await owner.rpc("void_job", { _job_id: job.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
    expect(num((await summary()).pipeline_value)).toBe(num(beforeSummary.pipeline_value));
  });

  it("overhead reduces net profit; paying it is operating cash out; voiding removes both", async () => {
    const s0 = await summary();
    const m0 = await month();
    const oh = await finance.rpc("create_overhead", { _date: today, _type: "Fixed", _amount: 1234, _note: "TEST overhead" });
    expect(oh.error).toBeNull();
    const s1 = await summary();
    expect(num(s0.net_profit) - num(s1.net_profit)).toBe(1234);
    expect(num(m0.net_profit) - num((await month()).net_profit)).toBe(1234);
    expect(num(s1.op_cash_out)).toBe(num(s0.op_cash_out));

    const early = await finance.rpc("pay_overhead", { _id: oh.data!.id, _payment_date: yesterday });
    expect(early.error?.message).toMatch(/earlier/);
    expect(
      (await finance.rpc("pay_overhead", { _id: oh.data!.id, _payment_date: today })).error,
    ).toBeNull();
    const again = await finance.rpc("pay_overhead", { _id: oh.data!.id, _payment_date: today });
    expect(again.error?.message).toMatch(/already paid/);
    expect(num((await summary()).op_cash_out) - num(s0.op_cash_out)).toBe(1234);

    const direct = await finance
      .from("payment_transactions")
      .insert({
        reference_type: "OPERATIONAL_EXPENSE",
        amount: 1,
        payment_method: "Cash",
        transaction_date: today,
      });
    expect(direct.error).not.toBeNull();

    expect(
      (await finance.rpc("void_overhead", { _id: oh.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
    const s2 = await summary();
    expect(num(s2.net_profit)).toBe(num(s0.net_profit));
    expect(num(s2.op_cash_out)).toBe(num(s0.op_cash_out));
  });

  it("investor money is financing only: never profit or operating cash", async () => {
    const s0 = await summary();
    const inv = await finance.rpc("create_investor_transaction", { _date: today, _type: "Loan In", _amount: 5000000, _note: "TEST loan" });
    expect(inv.error).toBeNull();
    const s1 = await summary();
    expect(num(s1.revenue)).toBe(num(s0.revenue));
    expect(num(s1.net_profit)).toBe(num(s0.net_profit));
    expect(num(s1.net_operating_cash)).toBe(num(s0.net_operating_cash));
    expect(num(s1.financing_in) - num(s0.financing_in)).toBe(5000000);
    expect(
      (
        await finance.rpc("void_investor_transaction", {
          _id: inv.data!.id,
          _reason: "TEST cleanup",
        })
      ).error,
    ).toBeNull();
    expect(num((await summary()).financing_in)).toBe(num(s0.financing_in));
  });

  it("payment dates before the bill date are rejected; voided bills leave every total", async () => {
    const s0 = await summary();
    const job = await owner.from("jobs").select("id").eq("is_void", false).limit(1).single();
    const ap = await ops.rpc("create_ap", { _job_id: job.data!.id, _vendor_id: null as unknown as string, _description: "TEST bill", _amount: 4321, _bill_date: today, _terms: 0 });
    expect(ap.error).toBeNull();
    expect(num((await summary()).cost) - num(s0.cost)).toBe(4321);
    const early = await finance.rpc("record_ap_payment", {
      _ap_id: ap.data!.id,
      _payment_date: yesterday,
      _amount: 1,
    });
    expect(early.error?.message).toMatch(/earlier than the bill date/);
    expect(
      (await finance.rpc("void_ap", { _id: ap.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
    const s1 = await summary();
    expect(num(s1.cost)).toBe(num(s0.cost));
    expect(num(s1.ap_outstanding)).toBe(num(s0.ap_outstanding));
    const aging = await finance.rpc("report_aging", { _kind: "ap" });
    expect((aging.data ?? []).some((r) => r.id === ap.data!.id)).toBe(false);
  });
});

function num(v: number | string | null | undefined) {
  return Number(v ?? 0);
}
