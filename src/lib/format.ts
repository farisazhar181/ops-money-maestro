export const idr = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0));

export const num = (n: number | string | null | undefined) => Number(n ?? 0);

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

export const isOverdue = (dueDate: string | null | undefined, balance: number) =>
  !!dueDate && balance > 0 && new Date(dueDate) < new Date(new Date().toDateString());

export const daysUntil = (dueDate: string | null | undefined) => {
  if (!dueDate) return 0;
  const ms = new Date(dueDate).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86400000);
};

export const addDays = (date: string, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const today = () => new Date().toISOString().slice(0, 10);

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
