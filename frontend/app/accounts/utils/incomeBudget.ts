/**
 * Income Statement 3-month budget — From/To selects 3 months.
 * Sales / Technical salaries are split from commission and overtime.
 * OPEX = heads only (no sub-heads). No Loans/PF.
 */

export type CoreBudgetKey =
  | "revenue"
  | "sales"
  | "sales_commission"
  | "technical"
  | "technical_overtime"
  | "email_marketing"
  | "administration"
  | "executive"
  | "other_payroll";

/** Core keys or dynamic `opex_head::Head` */
export type BudgetLineKey = CoreBudgetKey | string;

export type BudgetLine = {
  key: BudgetLineKey;
  label: string;
  kind: "core" | "opex_head";
  headLabel?: string;
  /** Per-month amounts keyed by YYYY-MM */
  months: Record<string, number>;
};

export type BudgetPeriod = {
  id: string;
  fromDate: string;
  toDate: string;
  monthKeys: string[];
  lines: BudgetLine[];
  notes?: string;
  updatedAt?: string;
};

export type BudgetQuarterLegacy = {
  id: string;
  startMonth?: string;
  endMonth?: string;
  fromDate?: string;
  toDate?: string;
  monthKeys?: string[];
  lines: {
    key: string;
    label: string;
    kind?: "core" | "opex_sub" | "opex_head";
    headLabel?: string;
    subLabel?: string;
    budget?: number;
    months?: Record<string, number>;
  }[];
  notes?: string;
  updatedAt?: string;
};

export type IncomeBudgetData = {
  quarters: BudgetPeriod[];
};

export const INCOME_BUDGET_STORE_DATE = "2000-01-01";

export const CORE_BUDGET_LINE_DEFS: { key: CoreBudgetKey; label: string }[] = [
  { key: "revenue", label: "Total Revenue" },
  { key: "sales", label: "Sales Team (incl. Team Lead)" },
  { key: "sales_commission", label: "Sales Team Commission (incl. Team Lead)" },
  { key: "technical", label: "Technical Team (incl. Manager)" },
  { key: "technical_overtime", label: "Technical Overtime (incl. Manager)" },
  { key: "email_marketing", label: "Email Marketing" },
  { key: "administration", label: "Administration" },
  { key: "executive", label: "Executive" },
  { key: "other_payroll", label: "Other Team Salaries" },
];

const DROPPED_KEYS = new Set(["opex", "loans", "pf"]);

export function isOpexHeadKey(key: string): boolean {
  return key.startsWith("opex_head::");
}

/** Legacy sub-head keys `opex::Head::Sub` */
export function isOpexSubKey(key: string): boolean {
  return key.startsWith("opex::");
}

export function opexHeadKey(headLabel: string): string {
  return `opex_head::${headLabel.trim()}`;
}

/** Parse head name from opex_head::X or legacy opex::Head::Sub */
export function headLabelFromOpexKey(key: string, fallback = ""): string {
  if (isOpexHeadKey(key)) return key.slice("opex_head::".length) || fallback;
  if (isOpexSubKey(key)) {
    const parts = key.split("::");
    return parts[1] || fallback;
  }
  return fallback;
}

export function monthLabel(ym: string): string {
  const [y, mm] = ym.split("-").map(Number);
  if (!y || !mm) return ym;
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthStart(ym: string): string {
  return `${ym}-01`;
}

export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

export function monthsBetweenDates(fromDate: string, toDate: string, maxMonths = 3): string[] {
  const from = fromDate.slice(0, 7);
  const to = toDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return [];
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  while (out.length < maxMonths) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (y === ey && m === em) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (y > ey! || (y === ey && m > em!)) break;
  }
  return out;
}

export function addMonthsYm(ym: string, delta: number): string {
  const [y0, m0] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y0!, (m0 || 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** From a start month → exact 3-month window (from 1st → end of +2 months). */
export function threeMonthWindowFromStart(startYmOrDate: string): {
  fromDate: string;
  toDate: string;
  monthKeys: string[];
} {
  const start = startYmOrDate.slice(0, 7);
  const m1 = start;
  const m2 = addMonthsYm(start, 1);
  const m3 = addMonthsYm(start, 2);
  return {
    fromDate: monthStart(m1),
    toDate: monthEnd(m3),
    monthKeys: [m1, m2, m3],
  };
}

export function defaultPeriodFromToday(): { fromDate: string; toDate: string; monthKeys: string[] } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  return threeMonthWindowFromStart(`${y}-${String(qStart).padStart(2, "0")}`);
}

export function periodId(fromDate: string, toDate: string): string {
  return `${fromDate.slice(0, 7)}_${toDate.slice(0, 7)}`;
}

export function emptyMonthMap(monthKeys: string[], fill = 0): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of monthKeys) o[k] = fill;
  return o;
}

export function lineTotal(line: BudgetLine): number {
  return Object.values(line.months ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);
}

export function emptyCoreLines(monthKeys: string[]): BudgetLine[] {
  return CORE_BUDGET_LINE_DEFS.map(d => ({
    key: d.key,
    label: d.label,
    kind: "core" as const,
    months: emptyMonthMap(monthKeys, 0),
  }));
}

/** Default Operating Expense heads (match Income Statement OPEX list). */
export const DEFAULT_OPEX_HEAD_LABELS = [
  "Office Management Expenses",
  "IT Equipments Expenses",
  "Regular IT Expenses",
  "Outsourcing Expenses",
  "Asset Purchasing Expenses",
  "Miscellaneous Expenses",
] as const;

export function emptyOpexHeadLines(monthKeys: string[]): BudgetLine[] {
  return DEFAULT_OPEX_HEAD_LABELS.map(label => ({
    key: opexHeadKey(label),
    label,
    kind: "opex_head" as const,
    headLabel: label,
    months: emptyMonthMap(monthKeys, 0),
  }));
}

function addMonthsInto(
  target: Record<string, number>,
  source: Record<string, number> | undefined,
  monthKeys: string[],
) {
  for (const mk of monthKeys) {
    target[mk] = (Number(target[mk]) || 0) + (Number(source?.[mk]) || 0);
  }
}

function migrateLine(
  old: BudgetQuarterLegacy["lines"][number],
  monthKeys: string[],
): BudgetLine | null {
  if (DROPPED_KEYS.has(old.key) && !isOpexSubKey(old.key) && !isOpexHeadKey(old.key)) return null;

  const isOpex = isOpexHeadKey(old.key) || isOpexSubKey(old.key) || old.kind === "opex_sub" || old.kind === "opex_head";
  if (!isOpex && !CORE_BUDGET_LINE_DEFS.some(d => d.key === old.key)) return null;

  let months = emptyMonthMap(monthKeys, 0);
  if (old.months && Object.keys(old.months).length) {
    months = { ...months, ...old.months };
  } else if (Number(old.budget) > 0 && monthKeys.length) {
    const total = Number(old.budget) || 0;
    const each = Math.round(total / monthKeys.length);
    monthKeys.forEach((k, i) => {
      months[k] = i === monthKeys.length - 1 ? total - each * (monthKeys.length - 1) : each;
    });
  }

  if (isOpex) {
    const head =
      old.headLabel ||
      headLabelFromOpexKey(old.key, old.label) ||
      String(old.label ?? "OPEX").trim();
    return {
      key: opexHeadKey(head),
      label: head,
      kind: "opex_head",
      headLabel: head,
      months,
    };
  }

  return {
    key: old.key,
    label: old.label,
    kind: "core",
    months,
  };
}

function migrateLegacyPeriod(q: BudgetQuarterLegacy): BudgetPeriod {
  let monthKeys = q.monthKeys?.length
    ? q.monthKeys.slice(0, 3)
    : q.startMonth && q.endMonth
      ? monthsBetweenDates(monthStart(q.startMonth), monthEnd(q.endMonth), 3)
      : defaultPeriodFromToday().monthKeys;
  if (!monthKeys.length) monthKeys = defaultPeriodFromToday().monthKeys;

  const fromDate = q.fromDate || monthStart(monthKeys[0]!);
  const toDate = q.toDate || monthEnd(monthKeys[monthKeys.length - 1]!);

  const migrated = (q.lines ?? [])
    .map(l => migrateLine(l, monthKeys))
    .filter((l): l is BudgetLine => !!l);

  // Roll legacy opex_sub rows that share a head into one opex_head line
  const byKey = new Map<string, BudgetLine>();
  for (const l of migrated) {
    const prev = byKey.get(String(l.key));
    if (!prev) {
      byKey.set(String(l.key), { ...l, months: { ...emptyMonthMap(monthKeys), ...l.months } });
      continue;
    }
    if (l.kind === "opex_head") {
      const months = { ...prev.months };
      addMonthsInto(months, l.months, monthKeys);
      byKey.set(String(l.key), { ...prev, months });
    }
  }

  const core = emptyCoreLines(monthKeys).map(c => byKey.get(c.key) ?? c);
  const opexByKey = new Map<string, BudgetLine>(
    [...byKey.values()]
      .filter(l => l.kind === "opex_head")
      .map(l => [String(l.key), l]),
  );
  for (const def of emptyOpexHeadLines(monthKeys)) {
    if (!opexByKey.has(String(def.key))) opexByKey.set(String(def.key), def);
  }
  const opex = [...opexByKey.values()].sort((a, b) => a.label.localeCompare(b.label));

  return {
    id: q.id || periodId(fromDate, toDate),
    fromDate,
    toDate,
    monthKeys,
    lines: [...core, ...opex],
    notes: q.notes,
    updatedAt: q.updatedAt,
  };
}

export function normalizeBudgetData(
  raw: IncomeBudgetData | { quarters?: BudgetQuarterLegacy[] } | null,
): IncomeBudgetData {
  return { quarters: (raw?.quarters ?? []).map(q => migrateLegacyPeriod(q as BudgetQuarterLegacy)) };
}

export function ensurePeriod(
  data: IncomeBudgetData | null | undefined,
  fromDate: string,
  toDate: string,
): BudgetPeriod {
  const monthKeys = monthsBetweenDates(fromDate, toDate, 3);
  const id = periodId(fromDate, toDate);
  const existing = (data?.quarters ?? []).find(
    q => q.id === id || (q.fromDate === fromDate && q.toDate === toDate),
  );
  if (existing) {
    const byKey = new Map(existing.lines.map(l => [l.key, l]));
    const core = emptyCoreLines(monthKeys).map(c => {
      const prev = byKey.get(c.key);
      if (!prev) return c;
      return {
        ...c,
        months: { ...emptyMonthMap(monthKeys), ...prev.months },
      };
    });
    const opexSaved = existing.lines
      .filter(l => l.kind === "opex_head" || isOpexHeadKey(l.key))
      .map(l => ({
        ...l,
        kind: "opex_head" as const,
        key: isOpexHeadKey(String(l.key)) ? l.key : opexHeadKey(l.headLabel || l.label),
        label: l.headLabel || l.label,
        months: { ...emptyMonthMap(monthKeys), ...l.months },
      }));
    const opexByKey = new Map<string, BudgetLine>(opexSaved.map(l => [String(l.key), l]));
    for (const def of emptyOpexHeadLines(monthKeys)) {
      if (!opexByKey.has(String(def.key))) opexByKey.set(String(def.key), def);
    }
    const opex = [...opexByKey.values()].sort((a, b) => a.label.localeCompare(b.label));
    return {
      ...existing,
      id,
      fromDate,
      toDate,
      monthKeys,
      lines: [...core, ...opex],
    };
  }
  return {
    id,
    fromDate,
    toDate,
    monthKeys,
    lines: [...emptyCoreLines(monthKeys), ...emptyOpexHeadLines(monthKeys)],
    notes: "",
  };
}

/** Merge OPEX head lines from actuals into the period (keep existing budgets). */
export function mergeOpexHeadsIntoPeriod(
  period: BudgetPeriod,
  opexFromActuals: {
    key: string;
    label: string;
    headLabel?: string;
    months?: Record<string, number>;
  }[],
): BudgetPeriod {
  const byKey = new Map(period.lines.map(l => [l.key, l]));
  for (const row of opexFromActuals) {
    const head = row.headLabel || row.label || headLabelFromOpexKey(row.key, "OPEX");
    const key = isOpexHeadKey(row.key) ? row.key : opexHeadKey(head);
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        label: head,
        headLabel: head,
        kind: "opex_head",
        months: { ...emptyMonthMap(period.monthKeys), ...prev.months },
      });
    } else {
      byKey.set(key, {
        key,
        label: head,
        kind: "opex_head",
        headLabel: head,
        months: emptyMonthMap(period.monthKeys, 0),
      });
    }
  }
  const core = emptyCoreLines(period.monthKeys).map(c => byKey.get(c.key) ?? c);
  const opex: BudgetLine[] = [...byKey.values()]
    .filter(l => l.kind === "opex_head" || isOpexHeadKey(String(l.key)))
    .map(l => ({ ...l, kind: "opex_head" as const }));
  for (const def of emptyOpexHeadLines(period.monthKeys)) {
    if (!opex.some(l => l.key === def.key)) opex.push(def);
  }
  opex.sort((a, b) => a.label.localeCompare(b.label));
  return { ...period, lines: [...core, ...opex] };
}

/** @deprecated use mergeOpexHeadsIntoPeriod */
export const mergeOpexSubsIntoPeriod = mergeOpexHeadsIntoPeriod;

export function upsertPeriod(data: IncomeBudgetData, period: BudgetPeriod): IncomeBudgetData {
  const rest = (data.quarters ?? []).filter(q => q.id !== period.id);
  return {
    quarters: [...rest, { ...period, updatedAt: new Date().toISOString() }].sort((a, b) =>
      a.fromDate.localeCompare(b.fromDate),
    ),
  };
}

export function shiftPeriod(fromDate: string, _toDate: string, deltaQuarters: number): {
  fromDate: string;
  toDate: string;
} {
  const startYm = addMonthsYm(fromDate.slice(0, 7), deltaQuarters * 3);
  return threeMonthWindowFromStart(startYm);
}

export type BudgetPredictionRow = {
  key: BudgetLineKey;
  label: string;
  kind: "core" | "opex_head";
  months: Record<string, number>;
  budgetTotal: number;
  actualTotal: number;
  predictedTotal: number;
};

export function predictNextPeriodBudget(
  period: BudgetPeriod,
  monthlyActuals: Partial<Record<string, Partial<Record<string, number>>>>,
  growthPct = 0,
): { nextFrom: string; nextTo: string; nextMonths: string[]; rows: BudgetPredictionRow[] } {
  const growth = 1 + (Number(growthPct) || 0) / 100;
  const shifted = shiftPeriod(period.fromDate, period.toDate, 1);
  const nextMonths = monthsBetweenDates(shifted.fromDate, shifted.toDate, 3);

  const rows: BudgetPredictionRow[] = period.lines.map(line => {
    const months: Record<string, number> = emptyMonthMap(nextMonths, 0);
    let budgetTotal = 0;
    let actualTotal = 0;
    period.monthKeys.forEach((mk, i) => {
      const budget = Math.max(0, Number(line.months[mk]) || 0);
      const actual = Math.max(0, Number(monthlyActuals[mk]?.[line.key]) || 0);
      budgetTotal += budget;
      actualTotal += actual;
      let predicted: number;
      if (actual > 0 && budget > 0) predicted = actual * 0.7 + budget * 0.3;
      else if (actual > 0) predicted = actual;
      else predicted = budget;
      const nk = nextMonths[i];
      if (nk) months[nk] = Math.round(predicted * growth);
    });
    return {
      key: line.key,
      label: line.label,
      kind: line.kind,
      months,
      budgetTotal,
      actualTotal,
      predictedTotal: Object.values(months).reduce((a, n) => a + n, 0),
    };
  });

  return { nextFrom: shifted.fromDate, nextTo: shifted.toDate, nextMonths, rows };
}

export function payrollKeys(): Set<string> {
  return new Set([
    "sales",
    "sales_commission",
    "technical",
    "technical_overtime",
    "email_marketing",
    "administration",
    "executive",
    "other_payroll",
  ]);
}

/** Expense lines for TOTAL BUDGET (everything except revenue). */
export function isBudgetExpenseLine(line: BudgetLine): boolean {
  return line.key !== "revenue";
}
