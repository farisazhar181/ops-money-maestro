/**
 * Validated write functions, edit/void actions and direct-write lockdown. Live backend.
 * Requires TEST_OWNER_TOKEN, TEST_FINANCE_EMAIL, TEST_OPS_EMAIL, TEST_PASSWORD. Rows are labelled "TEST" and voided.
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
  (env.TEST_FINANCE_TOKEN || (env.TEST_FINANCE_EMAIL && env.TEST_PASSWORD)) &&
  (env.TEST_OPS_TOKEN || (env.TEST_OPS_EMAIL && env.TEST_PASSWORD))
);
type DB = SupabaseClient<Database>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const NULL = null as unknown as string;
const today = jakartaDate();

async function signIn(email?: string, token?: string): Promise<DB> {
  if (token) return createClient<Database>(URL, KEY, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
  const c = createClient<Database>(URL, KEY, opts);
  const { error } = await c.auth.signInWithPassword({ email: email!, password: env.TEST_PASSWORD! });
  if (error) throw error;
  return c;
}
const jobArgs = (extra: Record<string, unknown> = {}) => ({
  _job_sheet_no: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  _customer_id: NULL,
  _order_date: today,
  _service_type: "",
  _unit_type: "",
  _quantity: "",
  _volume_weight: "",
  _origin: "A",
  _destination: "B",
  ...extra,
});

describe.skipIf(!enabled)("validated actions", () => {
  let owner: DB, finance: DB, ops: DB;
  beforeAll(async () => {
    owner = createClient<Database>(URL, KEY, {
      ...opts,
      global: { headers: { Authorization: `Bearer ${env.TEST_OWNER_TOKEN}` } },
    });
    finance = await signIn(env.TEST_FINANCE_EMAIL, env.TEST_FINANCE_TOKEN);
    ops = await signIn(env.TEST_OPS_EMAIL, env.TEST_OPS_TOKEN);
  });

  it("direct inserts and updates are refused on every business table", async () => {
    const job = await owner.from("jobs").select("id").limit(1).single();
    const attempts = [
      finance.from("jobs").insert({ job_sheet_no: "TEST-direct", order_date: today }),
      finance
        .from("job_financials")
        .insert({ job_id: job.data!.id, estimated_selling: 1, estimated_buying: 1 }),
      ops
        .from("accounts_payable")
        .insert({ job_id: job.data!.id, invoice_amount: 1, paid_amount: 1 }),
      finance
        .from("accounts_receivable")
        .insert({ invoice_no: "TEST", invoice_date: today, amount: 1, due_date: today }),
      finance.from("customers").insert({ company_name: "TEST direct" }),
      ops.from("subcontractors_vendors").insert({ vendor_name: "TEST direct" }),
      finance.from("accounts_payable").update({ attachment_path: "x" }).eq("job_id", job.data!.id),
      finance.from("customers").update({ phone: "1" }).not("id", "is", null),
    ];
    for (const a of attempts) expect((await a).error).not.toBeNull();
  });

  it("Finance can create jobs; Operations can create jobs but not set pricing", async () => {
    const f = await finance.rpc(
      "create_job",
      jobArgs({ _estimated_selling: 100, _estimated_buying: 50 }),
    );
    expect(f.error).toBeNull();
    const o = await ops.rpc("create_job", jobArgs({ _estimated_selling: 100 }));
    expect(o.error?.message).toMatch(/Management or Finance/);
    const o2 = await ops.rpc("create_job", jobArgs());
    expect(o2.error).toBeNull();
    const zero = await finance.rpc(
      "create_job",
      jobArgs({ _estimated_selling: 0, _estimated_buying: 50 }),
    );
    expect(zero.error?.message).toMatch(/greater than zero/);
    const toActive = await finance.rpc("close_job_financials", {
      _job_id: o2.data!.id,
      _actual_selling: NULL as unknown as number,
      _actual_buying: NULL as unknown as number,
      _status: "Active",
    });
    expect(toActive.error?.message).toMatch(/estimated selling and estimated buying/);
    const log = await finance.from("activity_log").select("entity_type").eq("job_id", f.data!.id);
    expect(log.data!.map((r) => r.entity_type).sort()).toEqual(["job_financials", "jobs"]);
    const opsLog = await ops.from("activity_log").select("entity_type").eq("job_id", f.data!.id);
    expect(opsLog.data!.every((r) => r.entity_type === "jobs")).toBe(true);
    for (const id of [f.data!.id, o2.data!.id])
      await finance.rpc("void_job", { _job_id: id, _reason: "TEST cleanup" });
  });

  it("Operations logs an unpaid AP line but cannot edit, void or pay it", async () => {
    const job = await finance.rpc(
      "create_job",
      jobArgs({ _estimated_selling: 10, _estimated_buying: 5 }),
    );
    const ap = await ops.rpc("create_ap", {
      _job_id: job.data!.id,
      _vendor_id: NULL,
      _description: "TEST ops bill",
      _amount: 1000,
      _bill_date: today,
      _terms: 7,
    });
    expect(ap.error).toBeNull();
    expect(Number(ap.data!.paid_amount)).toBe(0);
    expect(ap.data!.status).toBe("Unpaid");
    expect(ap.data!.due_date).not.toBe(today);
    expect((await ops.rpc("void_ap", { _id: ap.data!.id, _reason: "x" })).error).not.toBeNull();
    expect(
      (
        await ops.rpc("record_ap_payment", {
          _ap_id: ap.data!.id,
          _payment_date: today,
          _amount: 1,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await ops.rpc("edit_ap", {
          _id: ap.data!.id,
          _vendor_id: NULL,
          _description: "x",
          _amount: 1,
          _terms: 0,
          _due_date: today,
        })
      ).error,
    ).not.toBeNull();

    // Finance: pay, edit below paid rejected, edit logs before/after, blocked voids name dependents
    expect(
      (
        await finance.rpc("record_ap_payment", {
          _ap_id: ap.data!.id,
          _payment_date: today,
          _amount: 400,
        })
      ).error,
    ).toBeNull();
    const low = await finance.rpc("edit_ap", {
      _id: ap.data!.id,
      _vendor_id: NULL,
      _description: "TEST ops bill",
      _amount: 300,
      _terms: 7,
      _due_date: today,
    });
    expect(low.error?.message).toMatch(/less than amount already paid/);
    const ok = await finance.rpc("edit_ap", {
      _id: ap.data!.id,
      _vendor_id: NULL,
      _description: "TEST corrected",
      _amount: 1200,
      _terms: 7,
      _due_date: today,
    });
    expect(ok.error).toBeNull();
    const edited = await finance
      .from("activity_log")
      .select("old_values, new_values")
      .eq("entity_id", ap.data!.id)
      .eq("action", "edited")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(
      (edited.data!.old_values as { item_cost_description: string }).item_cost_description,
    ).toBe("TEST ops bill");
    expect(
      (edited.data!.new_values as { item_cost_description: string }).item_cost_description,
    ).toBe("TEST corrected");

    const blockedAp = await finance.rpc("void_ap", { _id: ap.data!.id, _reason: "TEST" });
    expect(blockedAp.error?.message).toMatch(/Void these payments first/);
    const blockedJob = await finance.rpc("void_job", { _job_id: job.data!.id, _reason: "TEST" });
    expect(blockedJob.error?.message).toMatch(/vendor cost TEST corrected/);

    const pay = await finance
      .from("ap_payments")
      .select("payment_transaction_id")
      .eq("ap_id", ap.data!.id)
      .single();
    expect(
      (
        await finance.rpc("void_cash_transaction", {
          _id: pay.data!.payment_transaction_id!,
          _reason: "TEST cleanup",
        })
      ).error,
    ).toBeNull();
    expect(
      (await finance.rpc("void_ap", { _id: ap.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
    const voided = await finance
      .from("accounts_payable")
      .select("is_void, voided_by, void_reason")
      .eq("id", ap.data!.id)
      .single();
    expect(voided.data).toMatchObject({ is_void: true, void_reason: "TEST cleanup" });
    expect(voided.data!.voided_by).toBeTruthy();
    expect(
      (await finance.rpc("void_job", { _job_id: job.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
  });

  it("invoices go through create_ar; Operations cannot issue one", async () => {
    const job = await finance.rpc(
      "create_job",
      jobArgs({ _estimated_selling: 10, _estimated_buying: 5 }),
    );
    const early = await finance.rpc("create_ar", {
      _job_id: job.data!.id,
      _invoice_no: "TEST-INV",
      _invoice_date: today,
      _amount: 10,
      _terms: 0,
    });
    expect(early.error?.message).toMatch(/Close the job/);
    await finance.rpc("close_job_financials", {
      _job_id: job.data!.id,
      _actual_selling: 10,
      _actual_buying: 5,
      _status: "Closed",
    });
    expect(
      (
        await ops.rpc("create_ar", {
          _job_id: job.data!.id,
          _invoice_no: "TEST-INV",
          _invoice_date: today,
          _amount: 10,
          _terms: 0,
        })
      ).error,
    ).not.toBeNull();
    const ar = await finance.rpc("create_ar", {
      _job_id: job.data!.id,
      _invoice_no: `TEST-INV-${Date.now()}`,
      _invoice_date: today,
      _amount: 10,
      _terms: 0,
    });
    expect(ar.error).toBeNull();
    expect(ar.data!.status).toBe("Issued");
    expect(
      (await finance.rpc("void_ar", { _id: ar.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
    expect(
      (await finance.rpc("void_job", { _job_id: job.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
  });

  it("Owner can create, edit and void overhead and investor entries; Operations cannot", async () => {
    const oh = await owner.rpc("create_overhead", {
      _date: today,
      _type: "Variable",
      _amount: 11,
      _note: "TEST owner overhead",
    });
    expect(oh.error).toBeNull();
    expect(
      (
        await owner.rpc("edit_overhead", {
          _id: oh.data!.id,
          _date: today,
          _type: "Fixed",
          _amount: 12,
          _note: "TEST owner overhead",
        })
      ).error,
    ).toBeNull();
    expect(
      (await owner.rpc("void_overhead", { _id: oh.data!.id, _reason: "TEST cleanup" })).error,
    ).toBeNull();
    const inv = await owner.rpc("create_investor_transaction", {
      _date: today,
      _type: "Repayment",
      _amount: 13,
      _note: "TEST owner repayment",
    });
    expect(inv.error).toBeNull();
    expect(
      (await owner.rpc("void_investor_transaction", { _id: inv.data!.id, _reason: "TEST cleanup" }))
        .error,
    ).toBeNull();
    expect(
      (
        await ops.rpc("create_overhead", {
          _date: today,
          _type: "Fixed",
          _amount: 1,
          _note: "TEST",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await ops.rpc("create_investor_transaction", {
          _date: today,
          _type: "Loan In",
          _amount: 1,
          _note: "TEST",
        })
      ).error,
    ).not.toBeNull();
  });
});
