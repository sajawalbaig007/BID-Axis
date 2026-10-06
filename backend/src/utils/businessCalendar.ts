/**
 * Business calendar — day rolls at 12:00 AM (midnight) Eastern (BEM Solutions).
 */

export const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE?.trim() || "America/New_York";

export const BUSINESS_DAY_START_HOUR = Number(
  process.env.BUSINESS_DAY_START_HOUR ?? 0,
);

function hourInTz(date: Date): number {
  return Number(
    date.toLocaleString("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }),
  );
}

/** Calendar YYYY-MM-DD in business timezone */
export function calendarYmdInTz(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });
}

/** Business date key (YYYY-MM-DD) — rolls at BUSINESS_DAY_START_HOUR */
export function getBusinessYmd(date: Date): string {
  const cal = calendarYmdInTz(date);
  if (hourInTz(date) < BUSINESS_DAY_START_HOUR) {
    const [y, m, d] = cal.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m! - 1, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    return prev.toISOString().slice(0, 10);
  }
  return cal;
}

export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

export function addDaysToYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** UTC instant when business day `ymd` starts (e.g. 4:00 AM local) */
export function businessDayStartUtc(ymd: string): Date {
  const { y, m, d } = parseYmd(ymd);
  const probeStart = Date.UTC(y, m - 1, d - 1, 0, 0, 0);
  const probeEnd   = Date.UTC(y, m - 1, d + 2, 0, 0, 0);

  for (let t = probeStart; t < probeEnd; t += 60_000) {
    const date = new Date(t);
    if (calendarYmdInTz(date) === ymd && hourInTz(date) === BUSINESS_DAY_START_HOUR) {
      const min = date.getMinutes();
      const sec = date.getSeconds();
      if (min === 0 && sec === 0) return date;
    }
  }

  for (let t = probeStart; t < probeEnd; t += 60_000) {
    const date = new Date(t);
    if (getBusinessYmd(date) === ymd) return date;
  }

  return new Date(probeStart);
}

export function currentBusinessYmd(now = new Date()): string {
  return getBusinessYmd(now);
}

export function isSameBusinessDay(a: Date, b: Date): boolean {
  return getBusinessYmd(a) === getBusinessYmd(b);
}

/** 3-hour buckets starting at business day open (4:00, 7:00, …) */
export function businessHourBucketKey(date: Date): string {
  const h = hourInTz(date);
  const offset = (h - BUSINESS_DAY_START_HOUR + 24) % 24;
  const bucketStart = Math.floor(offset / 3) * 3;
  const displayHour = (BUSINESS_DAY_START_HOUR + bucketStart) % 24;
  return `${displayHour}:00`;
}

export function initBusinessHourBuckets(): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (let i = 0; i < 24; i += 3) {
    const hour = (BUSINESS_DAY_START_HOUR + i) % 24;
    buckets[`${hour}:00`] = 0;
  }
  return buckets;
}

export function fmtWeekDayFromYmd(ymd: string): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString("en-US", { weekday: "short" });
}

export function fmtShortDateFromYmd(ymd: string): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtMonthShortFromYmd(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  return dt.toLocaleString("default", { month: "short" });
}

/** Chart fetch window — from business day start N days ago */
export function businessChartSinceUtc(daysBack: number, now = new Date()): Date {
  const today = currentBusinessYmd(now);
  const startYmd = addDaysToYmd(today, -daysBack);
  return businessDayStartUtc(startYmd);
}
