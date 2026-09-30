/**
 * API-level role checks against the live backend. Requires TEST_OWNER_TOKEN, TEST_FINANCE_TOKEN,
 * TEST_OPS_TOKEN, TEST_PENDING_TOKEN, TEST_DEACTIVATED_TOKEN (sessions for accounts in those states).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { jakartaDate } from "@/lib/format";

const URL = "https://xwxtvdhfsjsotskyogyf.supabase.co";
const KEY = "sb_publishable_b200cDEnyBjb39jbSiQJUw_MTrjCxeD";
const env = process.env;
const names = ["OWNER", "FINANCE", "OPS", "PENDING", "DEACTIVATED"] as const;
const enabled = names.every((n) => env[`TEST_${n}_TOKEN`]);
type DB = SupabaseClient<Database>;
const client = (token: string): DB =>
  createClient<Database>(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
const today = jakartaDate();
const dataTables = [
  "jobs",
  "job_financials",
  "customers",
  "subcontractors_vendors",
  "accounts_payable",
  "accounts_receivable",
  "ap_payments",
  "ar_payments",
  "payment_transactions",
  "overhead_costs",
  "investor_transactions",
  "activity_log",
] as const;
const reports = (c: DB) => [
  c.rpc("report_summary"),
  c.rpc("report_monthly", { _from: today, _to: today }),
  c.rpc("report_aging", { _kind: "ap" }),
  c.rpc("report_balances", { _from: today, _to: today }),
  c.rpc("report_top_parties", { _kind: "vendors", _from: today, _to: today, _limit: 5 }),
];

describe.skipIf(!enabled)("role access", () => {
  let owner: DB, finance: DB, ops: DB, pending: DB, deactivated: DB;
  beforeAll(() => {
    [owner, finance, ops, pending, deactivated] = names.map((n) => client(env[`TEST_${n}_TOKEN`]!));
  });

  for (const who of ["pending", "deactivated"] as const) {
    it(`${who} users see no business data and no reports`, async () => {
      const c = who === "pending" ? pending : deactivated;
      for (const t of dataTables) {
        const { data } = await c.from(t).select("*").limit(5);
        expect(data ?? [], t).toEqual([]);
      }
      for (const call of reports(c)) expect((await call).error).not.toBeNull();
      const { data: files } = await c.storage.from("finance-attachments").list("ap");
      expect(files ?? []).toEqual([]);
    });

    it(`${who} users cannot activate themselves or grant themselves a role`, async () => {
      const c = who === "pending" ? pending : deactivated;
      const { data: u } = await c.auth.getUser();
      const id = u.user!.id;
      await c.from("profiles").update({ status: "active" }).eq("id", id);
      await c.from("user_roles").insert({ user_id: id, role: "owner" });
      await c.rpc("assign_user_role", { _user_id: id, _role: "finance" });
      const p = await owner.from("profiles").select("status").eq("id", id).single();
      expect(p.data!.status).toBe(who);
      const r = await owner.from("user_roles").select("role").eq("user_id", id);
      expect(r.data).toEqual([]);
    });
  }

  it("Operations cannot retrieve pricing or any report figure", async () => {
    const f = await ops.from("job_financials").select("*").limit(5);
    expect(f.data ?? []).toEqual([]);
    expect((await finance.from("job_financials").select("job_id").limit(1)).data!.length).toBe(1);
    for (const t of [
      "accounts_receivable",
      "ar_payments",
      "payment_transactions",
      "overhead_costs",
      "investor_transactions",
    ] as const) {
      expect((await ops.from(t).select("*").limit(5)).data ?? [], t).toEqual([]);
    }
    for (const call of reports(ops)) expect((await call).error?.message).toMatch(/Not authorized/);
  });

  it("Operations cannot open invoice or vendor-bill files", async () => {
    for (const folder of ["ap", "ar"]) {
      const path = `${folder}/TEST-${Date.now()}/test.txt`;
      const up = await finance.storage.from("finance-attachments").upload(path, new Blob(["TEST"]));
      expect(up.error).toBeNull();
      expect((await ops.storage.from("finance-attachments").download(path)).error).not.toBeNull();
      expect((await owner.storage.from("finance-attachments").download(path)).error).toBeNull();
      await finance.storage.from("finance-attachments").remove([path]);
    }
  });

  it("Operations may create/read vendor cost lines (confirmed design) but not edit, pay or void them", async () => {
    const ap = await ops.from("accounts_payable").select("id").eq("is_void", false).limit(1);
    const id = ap.data?.[0]?.id;
    if (!id) return;
    expect(
      (await ops.rpc("record_ap_payment", { _ap_id: id, _payment_date: today, _amount: 1 })).error,
    ).not.toBeNull();
    expect((await ops.rpc("void_ap", { _id: id, _reason: "TEST" })).error).not.toBeNull();
    const upd = await ops.from("accounts_payable").update({ paid_amount: 1 }).eq("id", id).select();
    expect(upd.data ?? []).toEqual([]);
  });
});
