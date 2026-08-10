export interface DailyPoint {
  day: string; // "YYYY-MM-DD"
  total: number;
  ai: number;
}

/** Every day in the last 30 days (oldest first), as "YYYY-MM-DD" (UTC). */
export function last30Days(): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Fill a sparse day→count query result into a CONTINUOUS 30-day series — the
 * SQL group-by only returns days with at least one message, so a quiet day
 * would otherwise just be missing (silently compressing a line chart's
 * timeline) instead of showing as a real dip to zero.
 */
export function fillDailySeries(daily: DailyPoint[]): DailyPoint[] {
  const byDay = new Map(daily.map((r) => [r.day, r]));
  return last30Days().map((day) => {
    const r = byDay.get(day);
    return { day, total: r?.total ?? 0, ai: r?.ai ?? 0 };
  });
}
