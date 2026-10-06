/** Mirrors backend business day — rolls at 12:00 AM (midnight) Eastern (BEM Solutions). */

export const BUSINESS_TIMEZONE = "America/New_York";
export const BUSINESS_DAY_START_HOUR = 0;

function hourInTz(date: Date): number {
  return Number(
    date.toLocaleString("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }),
  );
}

export function calendarYmdInTz(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });
}

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

export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function currentBusinessYmd(now = new Date()): string {
  return getBusinessYmd(now);
}

export function isSameBusinessDay(a: Date, b: Date): boolean {
  return getBusinessYmd(a) === getBusinessYmd(b);
}

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
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  return dt.toLocaleDateString("en-US", { weekday: "short" });
}

export function fmtShortDateFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtMonthShortFromYmd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, 1, 12, 0, 0));
  return dt.toLocaleString("default", { month: "short" });
}
