/** First day of the month `months-1` months before today, through today (Jakarta ISO date). */
export function rangeFor(months: number, todayIso: string) {
  const [y, m] = todayIso.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1 - (months - 1), 1));
  return { from: start.toISOString().slice(0, 10), to: todayIso };
}
