import { describe, expect, it } from "vitest";
import { cashFlowDirection, closingError, paymentDateError } from "@/lib/finance-rules";
import { addDays, daysUntil, jakartaDate, numOrNull } from "@/lib/format";

describe("closing a job", () => {
  it("rejects blank or zero actuals when closing", () => {
    expect(closingError("Closed", null, 100)).toMatch(/greater than zero/);
    expect(closingError("Closed", 100, null)).toMatch(/greater than zero/);
    expect(closingError("Closed", 0, 100)).toMatch(/greater than zero/);
    expect(closingError("Closed", 100, 0)).toMatch(/greater than zero/);
    expect(closingError("Closed", 100, 60)).toBeNull();
  });
  it("allows unset actuals before closing, but never negatives", () => {
    expect(closingError("Active", null, null)).toBeNull();
    expect(closingError("Active", -1, null)).toMatch(/negative/);
  });
});

describe("blank vs zero", () => {
  it("keeps blank as null and zero as zero", () => {
    expect(numOrNull("")).toBeNull();
    expect(numOrNull("  ")).toBeNull();
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull("0")).toBe(0);
    expect(numOrNull("1500")).toBe(1500);
  });
});

describe("payment date rule", () => {
  it("rejects dates before the document date", () => {
    expect(paymentDateError("2026-09-01", "2026-09-02")).toMatch(/earlier/);
    expect(paymentDateError("2026-09-02", "2026-09-02")).toBeNull();
    expect(paymentDateError("", "2026-09-02")).toMatch(/required/);
  });
});

describe("cash-flow classification", () => {
  it("classifies every operating type explicitly", () => {
    expect(cashFlowDirection("AR_RECEIPT")).toBe("in");
    expect(cashFlowDirection("AP_PAYMENT")).toBe("out");
    expect(cashFlowDirection("OPERATIONAL_EXPENSE")).toBe("out");
  });
});

describe("Asia/Jakarta dates", () => {
  it("rolls over at midnight Jakarta time, not UTC", () => {
    expect(jakartaDate(new Date("2026-09-29T16:59:00Z"))).toBe("2026-09-29");
    expect(jakartaDate(new Date("2026-09-29T17:00:00Z"))).toBe("2026-09-30");
  });
  it("counts days between calendar dates", () => {
    expect(daysUntil("2026-10-01", "2026-09-29")).toBe(2);
    expect(daysUntil("2026-09-27", "2026-09-29")).toBe(-2);
    expect(addDays("2026-09-29", 30)).toBe("2026-10-29");
  });
});
