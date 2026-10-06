import { estCurrentMonthValue, estCurrentYear, estNowYmd } from "@/lib/estTime";

export type AccountsPeriodPreset =
  | "all_time"
  | "daily"
  | "month"
  | "date_range"
  /** @deprecated migrated to date_range */
  | "custom"
  | "q1"
  | "q2"
  | "q3"
  | "h1"
  | "h2";

export const PERIOD_PRESET_LABELS: Record<"all_time" | "daily" | "month" | "date_range", string> = {
  all_time: "All Time",
  daily: "Daily",
  month: "Monthly",
  date_range: "Date Range",
};

export const QUICK_PERIOD_PRESETS = ["all_time", "daily", "month", "date_range"] as const;

export function currentYear(): number {
  return estCurrentYear();
}

export function currentMonthValue(): string {
  return estCurrentMonthValue();
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Normalize legacy quarter / half presets to the new set. */
export function normalizePeriodPreset(preset: AccountsPeriodPreset): "all_time" | "daily" | "month" | "date_range" {
  if (preset === "all_time") return "all_time";
  if (preset === "daily") return "daily";
  if (preset === "month") return "month";
  return "date_range";
}

/** Compute from/to (YYYY-MM-DD) for a period preset. */
export function periodDateRange(
  preset: AccountsPeriodPreset,
  opts?: { year?: number; month?: string },
): { from: string; to: string } {
  const normalized = normalizePeriodPreset(preset);

  if (normalized === "all_time" || normalized === "daily") {
    // daily — from/to follow the picked day; caller owns it
    return { from: "", to: "" };
  }

  if (normalized === "month") {
    const monthVal = opts?.month ?? currentMonthValue();
    const [yStr, mStr] = monthVal.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return { from: "", to: "" };
    const last = lastDayOfMonth(y, m);
    const mm = String(m).padStart(2, "0");
    return {
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(last).padStart(2, "0")}`,
    };
  }

  // date_range — keep whatever the user set; caller owns from/to
  return { from: "", to: "" };
}

export function formatPeriodSummary(
  preset: AccountsPeriodPreset,
  from: string,
  to: string,
  filterMonth: string,
  recordDate?: string,
): string {
  const normalized = normalizePeriodPreset(preset);
  if (normalized === "all_time") {
    const today = estNowYmd();
    return `All Time · through ${today}`;
  }
  if (normalized === "daily") {
    if (!recordDate) return "Pick a day";
    const [y, m, d] = recordDate.split("-");
    const label = y && m && d
      ? new Date(Number(y), Number(m) - 1, Number(d)).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
      : recordDate;
    return `Day: ${label}`;
  }
  if (normalized === "date_range") {
    if (from && to) return `${from} → ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return "Pick a from / to date range";
  }
  if (normalized === "month") {
    const [y, m] = filterMonth.split("-");
    const label = y && m
      ? new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
      : filterMonth;
    return `Month: ${label}`;
  }
  return "";
}
