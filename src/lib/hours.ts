/**
 * Business hours — a small, pure, testable model. The engine consults this
 * before sending a live reply; outside hours it can send an off-hours note
 * instead. Kept intentionally simple (server-local hour window + day mask) so
 * it is deterministic and unit-testable by injecting the Date.
 */

export interface BusinessHours {
  enabled: boolean;
  /** 0-23 inclusive open hour (server local). */
  openHour?: number;
  /** 0-23 exclusive close hour (server local). */
  closeHour?: number;
  /** Allowed weekdays, 0=Sun … 6=Sat. Empty/undefined = every day. */
  days?: number[];
  /** Message to send when a customer writes outside hours (optional). */
  offHoursMessage?: string;
}

/** True if `date` falls within the configured open window. Disabled → always true. */
export function withinBusinessHours(h: BusinessHours | null | undefined, date: Date): boolean {
  if (!h || !h.enabled) return true;
  const day = date.getDay();
  if (h.days && h.days.length > 0 && !h.days.includes(day)) return false;
  const open = clampHour(h.openHour, 0);
  const close = clampHour(h.closeHour, 24);
  const hour = date.getHours();
  if (open === close) return true; // 24h
  if (open < close) return hour >= open && hour < close;
  // wraps past midnight (e.g. 20→6)
  return hour >= open || hour < close;
}

function clampHour(v: number | undefined, dflt: number): number {
  if (typeof v !== "number" || Number.isNaN(v)) return dflt;
  return Math.max(0, Math.min(24, Math.floor(v)));
}
