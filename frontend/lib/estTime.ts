/** BEM Solutions dashboards — Eastern Time for every clock, date, and “today”. */
export const EST_TIMEZONE = "America/New_York";
export const EST_TZ_LABEL = "Eastern Time (ET)";
export const EST_TZ_ABBR = "ET";

export function estNowYmd(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function estAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function estTomorrowYmd(value: Date = new Date()): string {
  return estAddDays(estNowYmd(value), 1);
}

export function estYesterdayYmd(value: Date = new Date()): string {
  return estAddDays(estNowYmd(value), -1);
}

export function formatEstDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: EST_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatEstDateShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    timeZone: EST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatEstDayMonth(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    timeZone: EST_TIMEZONE,
    day: "2-digit",
    month: "short",
  });
}

export function formatEstTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone: EST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatEstDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: EST_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Short note / status stamp: `25 Jun, 02:32:05 PM` in Eastern. */
export function formatEstStatusStamp(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", {
    timeZone: EST_TIMEZONE,
    day: "2-digit",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: EST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${date}, ${time}`;
}

export function formatEstDateTimeLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export function formatEstChatTime(iso: string): string {
  try {
    const ymd = estNowYmd(new Date(iso));
    const today = estNowYmd();
    if (ymd === today) return formatEstTime(iso);
    if (ymd === estYesterdayYmd()) return "Yesterday";
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: EST_TIMEZONE,
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function formatEstChatDaySep(iso: string): string {
  try {
    const ymd = estNowYmd(new Date(iso));
    if (ymd === estNowYmd()) return "Today";
    if (ymd === estYesterdayYmd()) return "Yesterday";
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: EST_TIMEZONE,
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function formatEstScheduleLabel(ymd: string): string {
  if (!ymd) return "";
  if (ymd === estNowYmd()) return "Today";
  if (ymd === estTomorrowYmd()) return "Tomorrow";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function formatEstCheckInLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (estNowYmd(d) === estNowYmd()) return formatEstTime(iso);
    return d.toLocaleString("en-US", {
      timeZone: EST_TIMEZONE,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function estCurrentYear(value: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: EST_TIMEZONE, year: "numeric" }).format(value),
  );
}

export function estCurrentMonthValue(value: Date = new Date()): string {
  return estNowYmd(value).slice(0, 7);
}

export function estMonthStartYmd(value: Date = new Date()): string {
  return `${estCurrentMonthValue(value)}-01`;
}
