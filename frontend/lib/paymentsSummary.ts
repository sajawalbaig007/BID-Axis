import API from "@/lib/api";
import { estCurrentMonthValue } from "@/lib/estTime";

export type PaymentChannelKey = "AH" | "SN" | "CHQ" | "HM";

export type ChannelCurrencyTotals = { USD: number; CAD: number; PKR: number };

export type PaymentEntrySummary = {
  id: string;
  type: string;
  amount: string;
  amountNum: number;
  currency: "USD" | "CAD" | "PKR" | null;
  channel: PaymentChannelKey | null;
  channelLabel: string;
  /** Payment slip / invoice URL */
  link: string | null;
  /** Paid / Unpaid (entry-level) */
  paymentStatus: "Paid" | "Unpaid";
  /** When payment was marked paid (ISO) */
  paidAt: string | null;
  /** When payment row was created (ISO) */
  createdAt: string | null;
  /** Accounts receive month YYYY-MM (separate from paidAt) */
  accountsMonth: string | null;
  isPartialType: boolean;
};

export type ProjectPaymentSummaryRow = {
  leadId: string;
  rowKey?: string;
  projectCode: string | null;
  projectTitle: string | null;
  clientName: string | null;
  clientEmail: string | null;
  quoted: number;
  quotedLabel: string;
  paidTotal: number;
  paidLabel: string;
  percent: number;
  status: "full" | "partial" | "unpaid";
  /** Admin marked that no further payment is expected */
  discarded?: boolean;
  sumAmount?: number;
  remainingDue?: number;
  unpaidFromPartial?: boolean;
  payments: PaymentEntrySummary[];
};

export type ChannelSummary = {
  key: PaymentChannelKey;
  label: string;
  totals: ChannelCurrencyTotals;
  totalAmount: number;
  paymentCount: number;
  projectCount: number;
  activeCurrencies: ("USD" | "CAD" | "PKR")[];
  /** PKR after Accounts formula (tax factor × FX), not raw PKR receipts only */
  pkrFormula: number;
};

export type PaymentsSummaryPayload = {
  success: boolean;
  month: string | null;
  monthLabel: string;
  generatedAt: string;
  channels: ChannelSummary[];
  totals: {
    projectCount: number;
    quotedProjects: number;
    quotedAmount: number;
    collectedAmount: number;
    collectedByCurrency: ChannelCurrencyTotals;
    outstandingAmount: number;
    collectionRate: number;
    collectedEntries: number;
    unassignedPaidCount: number;
    fullPaidCount: number;
    partialPaidCount: number;
    unpaidWithQuoteCount: number;
    thisMonth?: string;
    prevMonth?: string;
    quotedThisMonth?: number;
    quotedPrevMonth?: number;
    collectedThisMonth?: number;
    collectedPrevMonth?: number;
    collectedFromPending?: number;
    outstandingThisMonth?: number;
    outstandingPrevMonths?: number;
    outstandingPrevMonthOnly?: number;
  };
  statusBreakdown: {
    paid: number;
    partial: number;
    unpaid: number;
  };
  fullPaidProjects: ProjectPaymentSummaryRow[];
  partialPaidProjects: ProjectPaymentSummaryRow[];
  unpaidProjects: ProjectPaymentSummaryRow[];
};

export const CHANNEL_STYLES: Record<
  PaymentChannelKey,
  { color: string; soft: string; border: string }
> = {
  AH: { color: "#EF4444", soft: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/30" },
  SN: { color: "#3B82F6", soft: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/30" },
  CHQ: { color: "#F59E0B", soft: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/30" },
  HM: { color: "#14B8A6", soft: "bg-teal-50 dark:bg-teal-500/10", border: "border-teal-200 dark:border-teal-500/30" },
};

export function currentMonthIso(): string {
  return estCurrentMonthValue();
}

export function formatMoney(n: number, currency?: string | null): string {
  if (n <= 0) return "—";
  const prefix =
    currency === "PKR" ? "PKR " : currency === "CAD" ? "CAD " : currency === "USD" ? "$" : "$";
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatMoneyAlways(n: number, currency?: string | null): string {
  const prefix =
    currency === "PKR" ? "PKR " : currency === "CAD" ? "CAD " : currency === "USD" ? "$" : "$";
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export async function fetchPaymentsSummary(month?: string | null): Promise<PaymentsSummaryPayload> {
  const params: Record<string, string> = {};
  if (month && /^\d{4}-\d{2}$/.test(month)) params.month = month;
  const res = await API.get("/admin/payments-summary", { params });
  return res.data as PaymentsSummaryPayload;
}
