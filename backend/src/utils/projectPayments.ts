export type PaymentChannel = "AH" | "SN" | "CHQ" | "HM";
export type PaymentCurrency = "USD" | "CAD" | "PKR";

export const PAYMENT_CHANNELS: PaymentChannel[] = ["AH", "SN", "CHQ", "HM"];
export const PAYMENT_CURRENCIES: PaymentCurrency[] = ["USD", "CAD", "PKR"];

export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  AH: "Ahmed Hamza",
  SN: "Sharjeel Nasir",
  CHQ: "Cheque",
  HM: "Habib Metro",
};

export type ProjectPaymentEntry = {
  id: string;
  type: string;
  amount: string;
  link?: string;
  isPaid: boolean;
  paidAt?: string;
  /** When this payment row was first created */
  createdAt?: string;
  /** Accounts currency channel — set by Admin/Manager when payment arrives */
  paymentChannel?: PaymentChannel;
  /** USD / CAD / PKR — feeds Accounts dashboard for that channel */
  currency?: PaymentCurrency;
  /** YYYY-MM — Accounts month this payment counts in */
  accountsMonth?: string;
};

function normalizeChannel(raw: unknown): PaymentChannel | undefined {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "AH" || v === "SN" || v === "CHQ" || v === "HM") return v;
  return undefined;
}

function normalizeCurrency(raw: unknown): PaymentCurrency | undefined {
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

function sanitizeEntry(raw: Partial<ProjectPaymentEntry> & Record<string, unknown>): ProjectPaymentEntry {
  const channel = normalizeChannel(raw.paymentChannel);
  const currency = normalizeCurrency(raw.currency);
  const accountsMonth = normalizeAccountsMonth(raw.accountsMonth);
  const entry: ProjectPaymentEntry = {
    id: String(raw.id ?? ""),
    type: String(raw.type ?? "Partial"),
    amount: String(raw.amount ?? ""),
    isPaid: Boolean(raw.isPaid),
  };
  if (typeof raw.link === "string" && raw.link.trim()) entry.link = raw.link.trim();
  if (typeof raw.paidAt === "string" && raw.paidAt.trim()) entry.paidAt = raw.paidAt.trim();
  if (typeof raw.createdAt === "string" && raw.createdAt.trim()) entry.createdAt = raw.createdAt.trim();
  if (!entry.createdAt && entry.paidAt) entry.createdAt = entry.paidAt;
  if (channel) entry.paymentChannel = channel;
  if (currency) entry.currency = currency;
  if (accountsMonth) entry.accountsMonth = accountsMonth;
  return entry;
}

export function parseProjectPayments(raw: string | null | undefined): ProjectPaymentEntry[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => sanitizeEntry((e ?? {}) as Record<string, unknown>));
  } catch {
    return [];
  }
}

export function stringifyProjectPayments(entries: ProjectPaymentEntry[]): string {
  return JSON.stringify(entries.map((e) => sanitizeEntry(e as unknown as Record<string, unknown>)));
}

export function parseMoney(raw: string | number | null | undefined): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

export function paidTotalFromEntries(entries: ProjectPaymentEntry[]): number {
  return entries
    .filter((e) => e.isPaid)
    .reduce((sum, e) => sum + parseMoney(e.amount), 0);
}

export function latestPaidEntry(entries: ProjectPaymentEntry[]): ProjectPaymentEntry | null {
  const paid = entries.filter((e) => e.isPaid && e.paidAt);
  if (paid.length === 0) {
    const anyPaid = entries.filter((e) => e.isPaid);
    return anyPaid.length ? anyPaid[anyPaid.length - 1] : null;
  }
  return [...paid].sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
}

export function paymentPercent(entries: ProjectPaymentEntry[], budget: string | null | undefined): number {
  const budgetNum = parseMoney(budget);
  if (budgetNum <= 0) return 0;
  return Math.min(100, (paidTotalFromEntries(entries) / budgetNum) * 100);
}

export function normalizePaymentsInput(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string") {
    return stringifyProjectPayments(parseProjectPayments(input));
  }
  if (Array.isArray(input)) {
    return stringifyProjectPayments(
      input.map((e) => sanitizeEntry((e ?? {}) as Record<string, unknown>)),
    );
  }
  return undefined;
}

/**
 * CSR cannot set/change payment slip links, channel, currency, or accounts month —
 * keep existing values from DB per payment id. New CSR-created entries get none.
 */
export function preservePaymentSlipLinksForCsr(
  incomingRaw: string | undefined,
  existingRaw: string | null | undefined,
): string | undefined {
  if (incomingRaw === undefined) return undefined;
  const incoming = parseProjectPayments(incomingRaw);
  const existingById = new Map(
    parseProjectPayments(existingRaw).map((e) => [e.id, e] as const),
  );
  const merged = incoming.map((e) => {
    const prev = existingById.get(e.id);
    const next: ProjectPaymentEntry = { ...e };
    if (prev?.link?.trim()) next.link = prev.link.trim();
    else delete next.link;
    if (prev?.paymentChannel) next.paymentChannel = prev.paymentChannel;
    else delete next.paymentChannel;
    if (prev?.currency) next.currency = prev.currency;
    else delete next.currency;
    if (prev?.accountsMonth) next.accountsMonth = prev.accountsMonth;
    else delete next.accountsMonth;
    // Keep history timestamps
    if (prev?.createdAt && !next.createdAt) next.createdAt = prev.createdAt;
    if (prev?.paidAt && e.isPaid && !next.paidAt) next.paidAt = prev.paidAt;
    return next;
  });
  return stringifyProjectPayments(merged);
}
