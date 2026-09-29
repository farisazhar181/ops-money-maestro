import { describe, expect, it } from "vitest";
import { rangeFor } from "@/lib/statistics";

describe("statistics range", () => {
  it("covers trailing N months including the current one", () => {
    expect(rangeFor(12, "2026-09-29")).toEqual({ from: "2025-10-01", to: "2026-09-29" });
    expect(rangeFor(6, "2026-01-15")).toEqual({ from: "2025-08-01", to: "2026-01-15" });
    expect(rangeFor(24, "2026-03-31")).toEqual({ from: "2024-04-01", to: "2026-03-31" });
  });
});
