export type PaymentChannel = "AH" | "SN" | "CHQ" | "HM";
export type PaymentCurrency = "USD" | "CAD" | "PKR";

export const PAYMENT_CHANNEL_OPTIONS: { value: PaymentChannel; label: string }[] = [
  { value: "AH", label: "Ahmed Hamza" },
  { value: "SN", label: "Sharjeel Nasir" },
  { value: "CHQ", label: "Cheque" },
  { value: "HM", label: "Habib Metro" },
];

export const PAYMENT_CURRENCY_OPTIONS: PaymentCurrency[] = ["USD", "CAD", "PKR"];

export type ProjectPayment = {
  id: string;
  type: string;
  amount: string;
  link?: string;
  isPaid: boolean;
  paidAt?: string;
  /** When this payment row was first added (history) */
  createdAt?: string;
  /** Accounts currency channel — Admin/Manager when payment arrives */
  paymentChannel?: PaymentChannel;
  /** USD / CAD / PKR — shown on Accounts currency section */
  currency?: PaymentCurrency;
  /** YYYY-MM — Accounts month this payment counts in */
  accountsMonth?: string;
};

export const PROJECT_PHASE_OPTIONS = [
  { value: "not_started",       label: "Not Started" },
  { value: "takeoff_started",   label: "Takeoff Started" },
  { value: "takeoff_completed", label: "Takeoff Completed" },
  { value: "pricing_phase",     label: "Pricing Phase" },
  { value: "qa_phase",          label: "QA Phase" },
  { value: "delivery_phase",    label: "Delivery Phase" },
] as const;

export const PAYMENT_TYPE_OPTIONS = [
  "Partial",
  "Full",
] as const;

/** Project DB filters — Partial (<100%), Full (100%), or Unpaid (nothing collected) */
export const PAYMENT_TYPE_FILTER_OPTIONS = [
  "Partial",
  "Full",
  "Unpaid",
] as const;

/** Display label: force Full when quote is fully collected. */
export function paymentTypeDisplay(
  type: string | undefined,
  payments: ProjectPayment[],
  budget: string | null | undefined,
): string {
  if (paymentPercent(payments, budget) >= 100) return "Full";
  const t = String(type ?? "Partial").trim();
  if (t.toLowerCase() === "full" || t.toLowerCase() === "full payment") return "Full";
  return t || "Partial";
}

/** True when project matches Project DB Partial/Full payment filter. */
export function matchesPaymentCollectionFilter(
  filter: string,
  payments: ProjectPayment[],
  budget: string | null | undefined,
): boolean {
  const f = filter.trim().toLowerCase();
  if (!f) return true;
  const pct = paymentPercent(payments, budget);
  if (f === "full") return pct >= 100;
  if (f === "partial") return pct > 0 && pct < 100;
  if (f === "unpaid") return parseMoney(budget) > 0 && pct <= 0;
  return true;
}

function normalizePaymentChannel(raw: unknown): PaymentChannel | undefined {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "AH" || v === "SN" || v === "CHQ" || v === "HM") return v;
  return undefined;
}

function normalizePaymentCurrency(raw: unknown): PaymentCurrency | undefined {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "USD" || v === "CAD" || v === "PKR") return v;
  return undefined;
}

function normalizeAccountsMonth(raw: unknown): string | undefined {
  const v = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 7);
  return undefined;
}

function sanitizePayment(raw: Partial<ProjectPayment> & Record<string, unknown>): ProjectPayment {
  const channel = normalizePaymentChannel(raw.paymentChannel);
  const currency = normalizePaymentCurrency(raw.currency);
  const accountsMonth = normalizeAccountsMonth(raw.accountsMonth);
  const entry: ProjectPayment = {
    id: String(raw.id ?? ""),
    type: String(raw.type ?? "Partial"),
    amount: String(raw.amount ?? ""),
    isPaid: Boolean(raw.isPaid),
  };
  if (typeof raw.link === "string" && raw.link.trim()) entry.link = raw.link.trim();
  if (typeof raw.paidAt === "string" && raw.paidAt.trim()) entry.paidAt = raw.paidAt.trim();
  if (typeof raw.createdAt === "string" && raw.createdAt.trim()) entry.createdAt = raw.createdAt.trim();
  // Backfill history timestamp from paidAt for older rows
  if (!entry.createdAt && entry.paidAt) entry.createdAt = entry.paidAt;
  if (channel) entry.paymentChannel = channel;
  if (currency) entry.currency = currency;
  if (accountsMonth) entry.accountsMonth = accountsMonth;
  return entry;
}

export function parsePayments(raw: unknown): ProjectPayment[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((e) => sanitizePayment((e ?? {}) as Record<string, unknown>));
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((e) => sanitizePayment((e ?? {}) as Record<string, unknown>))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseMoney(raw: string | number | null | undefined): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

/** Strip currency symbols for budget/amount inputs (avoids "$" + "$620" / "$0.00" overlap) */
export function stripBudgetForInput(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/^[\$\s]*(?:Rs\.?|PKR|CAD|C\$)?\s*/i, "")
    .replace(/,/g, "")
    .trim();
}

export function formatQuotedAmount(raw: string | null | undefined): string {
  const n = parseMoney(raw);
  return n > 0 ? `$${n.toLocaleString()}` : "—";
}

export function paidTotal(payments: ProjectPayment[]): number {
  return payments.filter((p) => p.isPaid).reduce((s, p) => s + parseMoney(p.amount), 0);
}

export function latestPaidPayment(payments: ProjectPayment[]): ProjectPayment | null {
  const paid = payments.filter((p) => p.isPaid);
  if (!paid.length) return null;
  return sortPaymentsNewestFirst(paid)[0] ?? null;
}

/** Sort by paidAt, then createdAt (newest first) — full payment history order. */
export function sortPaymentsNewestFirst(payments: ProjectPayment[]): ProjectPayment[] {
  return [...payments].sort((a, b) => {
    const ta = a.paidAt || a.createdAt || "";
    const tb = b.paidAt || b.createdAt || "";
    if (ta && tb) return tb.localeCompare(ta);
    if (ta) return -1;
    if (tb) return 1;
    return 0;
  });
}

/** Activity timestamp for a payment row (paid date preferred). */
export function paymentActivityAt(p: ProjectPayment): string | undefined {
  return p.paidAt || p.createdAt;
}

export function paymentPercent(payments: ProjectPayment[], budget: string | number | null | undefined): number {
  const budgetNum = parseMoney(budget);
  if (budgetNum <= 0) return 0;
  return Math.min(100, (paidTotal(payments) / budgetNum) * 100);
}

export function phaseLabel(phase: string | null | undefined): string {
  return PROJECT_PHASE_OPTIONS.find((p) => p.value === phase)?.label ?? "Not Started";
}

/** YYYY-MM-DD from paidAt without timezone shift (avoids UTC midnight → previous day). */
export function paymentCalendarDay(iso: string | null | undefined): string {
  const m = String(iso ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? "";
}

export function paymentCalendarMonth(iso: string | null | undefined): string | undefined {
  const day = paymentCalendarDay(iso);
  return day ? day.slice(0, 7) : undefined;
}

/** Display a stored date as day-month-year with dashes (27-08-2026). */
export function formatDateDayMonthYear(iso?: string | Date | null): string {
  if (!iso) return "";
  if (typeof iso === "string") {
    const ymd = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
    const dmyDash = iso.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (dmyDash) {
      const d = dmyDash[1].padStart(2, "0");
      const m = dmyDash[2].padStart(2, "0");
      const y = dmyDash[3].length === 2 ? `20${dmyDash[3]}` : dmyDash[3];
      return `${d}-${m}-${y}`;
    }
    const dmySlash = iso.trim().match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (dmySlash) {
      const d = dmySlash[1].padStart(2, "0");
      const m = dmySlash[2].padStart(2, "0");
      const y = dmySlash[3].length === 2 ? `20${dmySlash[3]}` : dmySlash[3];
      return `${d}-${m}-${y}`;
    }
  }
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export function formatPaymentDateOnly(iso: string | undefined): string {
  const day = paymentCalendarDay(iso);
  if (!day) return "—";
  return formatDateDayMonthYear(day) || day;
}

export function formatPaymentWhen(iso: string | undefined): string {
  if (!iso) return "—";
  const dayOnly = formatPaymentDateOnly(iso);
  if (dayOnly !== "—") return dayOnly;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDateDayMonthYear(iso) || iso;
}

/** Local calendar YYYY-MM when the project was added — matches the “Added” date in Project DB. */
export function projectAddedYearMonth(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Local calendar YYYY-MM-DD when the project was added. */
export function projectAddedDay(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM of the client deadline (date-only, no timezone shift). */
export function projectDeadlineYearMonth(deadline?: string | Date | null): string | null {
  if (!deadline) return null;
  if (typeof deadline === "string") {
    const m = deadline.trim().match(/^(\d{4}-\d{2})/);
    if (m) return m[1];
  }
  return projectAddedYearMonth(deadline);
}

/** YYYY-MM-DD of the client deadline (date-only, no timezone shift). */
export function projectDeadlineDay(deadline?: string | Date | null): string | null {
  if (!deadline) return null;
  if (typeof deadline === "string") {
    const m = deadline.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return projectAddedDay(deadline);
}

export function formatPaymentMoney(amount: string | number, currency?: PaymentCurrency | null): string {
  const n = parseMoney(amount);
  if (n <= 0) return "—";
  const prefix =
    currency === "PKR" ? "PKR " : currency === "CAD" ? "CAD " : currency === "USD" ? "$" : "$";
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function paymentChannelLabel(channel?: PaymentChannel | null): string {
  if (!channel) return "—";
  return PAYMENT_CHANNEL_OPTIONS.find((o) => o.value === channel)?.label ?? channel;
}

export function newPaymentId(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export type ProjectWorkbenchData = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  ownerName: string;
  state: string;
  projectCode: string;
  projectTitle: string;
  projectScope: string;
  interestedService: string;
  projectBudget: string;
  projectDeadline: string;
  /** Emergency submit: morning | cob | "" */
  deadlineTiming: "" | "morning" | "cob";
  projectPhase: string;
  takeoffDeadline: string;
  pricingDeadline: string;
  qaDeadline: string;
  projectPayments: ProjectPayment[];
  assignedTo?: string;
  projectSource?: string;
  projectNotes?: string;
  csrName?: string;
  csrCode?: string | null;
  /** When the project was first created — original quote belongs to this day */
  projectCreatedAt?: string;
};

export const CSR_ASSIGN_OTHER = "__other__";

export function emptyWorkbench(): ProjectWorkbenchData {
  return {
    id: "",
    name: "",
    company: "",
    phone: "",
    email: "",
    ownerName: "",
    state: "",
    projectCode: "",
    projectTitle: "",
    projectScope: "",
    interestedService: "",
    projectBudget: "",
    projectDeadline: "",
    deadlineTiming: "",
    projectPhase: "not_started",
    takeoffDeadline: "",
    pricingDeadline: "",
    qaDeadline: "",
    projectPayments: [],
  };
}

/** Same rule as Admin → Active Projects tab. Not completed = still active (including overdue). */
export function isProjectActive(p: {
  status?: string | null;
  projectDeadline?: string | null;
  projectWorkStatus?: string | null;
}): boolean {
  const work = (p.projectWorkStatus ?? "").toLowerCase();
  const st = (p.status ?? "").toLowerCase();
  if (work === "completed" || st === "completed") return false;
  if (work === "in_progress" || work === "not_completed") return true;
  if (st === "close client") return true;
  if (p.projectDeadline) {
    const deadline = p.projectDeadline.split("T")[0] ?? "";
    const today = new Date().toISOString().split("T")[0] ?? "";
    return deadline >= today;
  }
  return false;
}

export type ProjectWorkStatus = "completed" | "in_progress" | "not_completed";

export type DeadlineTiming = "" | "morning" | "cob";

export function normalizeDeadlineTiming(raw: unknown): DeadlineTiming {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "morning" || v === "cob") return v;
  return "";
}

export const PROJECT_WORK_STATUS_OPTIONS: { value: ProjectWorkStatus; label: string }[] = [
  { value: "in_progress", label: "In Progress" },
  { value: "not_completed", label: "Not Completed" },
  { value: "completed", label: "Completed" },
];

export function getProjectWorkStatus(p: {
  status?: string | null;
  projectDeadline?: string | null;
  projectWorkStatus?: string | null;
}): { key: ProjectWorkStatus; label: string } {
  const work = (p.projectWorkStatus ?? "").toLowerCase();
  if (work === "completed") return { key: "completed", label: "Completed" };
  if (work === "in_progress") return { key: "in_progress", label: "In Progress" };
  if (work === "not_completed") return { key: "not_completed", label: "Not Completed" };

  const st = (p.status ?? "").toLowerCase();
  if (st === "completed") return { key: "completed", label: "Completed" };
  if (isProjectActive(p)) return { key: "in_progress", label: "In Progress" };
  return { key: "not_completed", label: "Not Completed" };
}
