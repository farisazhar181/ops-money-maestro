export const idr = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0));

/** Shows "Not set" for null/undefined instead of silently rendering Rp0. */
export const idrOrUnset = (n: number | string | null | undefined) => (n === null || n === undefined ? "Not set" : idr(n));

export const num = (n: number | string | null | undefined) => Number(n ?? 0);

/** Parses a form value, keeping blank as null (not zero). */
export const numOrNull = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const BUSINESS_TZ = "Asia/Jakarta";

/** Calendar date (YYYY-MM-DD) in Asia/Jakarta for the given instant. */
export const jakartaDate = (at: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** Today's business date in Asia/Jakarta. */
export const today = () => jakartaDate();

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: BUSINESS_TZ }) : "-";

const dayNumber = (isoDate: string) => Math.floor(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / 86400000);

export const daysUntil = (dueDate: string | null | undefined, todayIso: string = today()) => {
  if (!dueDate) return 0;
  return dayNumber(dueDate) - dayNumber(todayIso);
};

export const isOverdue = (dueDate: string | null | undefined, balance: number, todayIso: string = today()) =>
  !!dueDate && balance > 0 && daysUntil(dueDate, todayIso) < 0;

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}%`);
