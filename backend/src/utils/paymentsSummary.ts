import prisma from "../config/db";
import { buildProjectLeadWhere, isDisplayableProjectLead } from "./projectLeads";
import {
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNELS,
  parseMoney,
  parseProjectPayments,
  paidTotalFromEntries,
  paymentPercent,
  type PaymentChannel,
  type PaymentCurrency,
  type ProjectPaymentEntry,
} from "./projectPayments";
import { paymentAccountsMonth } from "./projectCurrencyCollections";
import { paymentsChannelPkr } from "./currencyFormula";
import { estDateYmd } from "./estTime";

export type ChannelCurrencyTotals = {
  USD: number;
  CAD: number;
  PKR: number;
};

export type PaymentEntrySummary = {
  id: string;
  type: string;
  amount: string;
  amountNum: number;
  currency: PaymentCurrency | null;
  channel: PaymentChannel | null;
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
  /** Unique key when a partial project appears in both collected and unpaid lists */
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
  /** Amount included in the table sum (collected = paid; unpaid = remaining / quoted) */
  sumAmount?: number;
  remainingDue?: number;
  unpaidFromPartial?: boolean;
  payments: PaymentEntrySummary[];
};

export type ChannelSummary = {
  key: PaymentChannel;
  label: string;
  totals: ChannelCurrencyTotals;
  /** Sum across currencies (display / chart ranking) */
  totalAmount: number;
  paymentCount: number;
  projectCount: number;
  activeCurrencies: PaymentCurrency[];
  pkrFormula: number;
};

export type PaymentsSummaryPayload = {
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
    thisMonth: string;
    prevMonth: string;
    quotedThisMonth: number;
    quotedPrevMonth: number;
    collectedThisMonth: number;
    collectedPrevMonth: number;
    collectedFromPending: number;
    outstandingThisMonth: number;
    outstandingPrevMonths: number;
    outstandingPrevMonthOnly: number;
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

function monthDisplayLabel(month: string | null): string {
  if (!month) return "All time";
  const [y, mo] = month.split("-").map(Number);
  if (!y || !mo) return month;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function currentMonthEst(): string {
  return estDateYmd().slice(0, 7);
}

function shiftMonth(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Date-only YYYY-MM / YYYY-MM-DD stay as written. Timestamps use Eastern. */
function calendarMonthEst(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    const t = d.trim();
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(t)) return t.slice(0, 7);
    const dt = new Date(t);
    if (Number.isNaN(dt.getTime())) return null;
    return estDateYmd(dt).slice(0, 7);
  }
  if (Number.isNaN(d.getTime())) return null;
  return estDateYmd(d).slice(0, 7);
}

/** Calendar month the money was collected — payment date only. */
function paymentDateMonth(entry: ProjectPaymentEntry): string | null {
  if (!entry.isPaid) return null;
  return calendarMonthEst(entry.paidAt ?? null);
}

/**
 * Business month of a project: earlier of CRM created month and first payment month.
 * Late-entered jobs (created in September, first paid in August) stay in August.
 */
function projectBusinessMonth(
  createdAt: Date | string | null | undefined,
  payments: ProjectPaymentEntry[],
): string | null {
  const created = calendarMonthEst(createdAt);
  let earliestPay: string | null = null;
  for (const e of payments) {
    if (!e.isPaid) continue;
    const pm = paymentDateMonth(e);
    if (pm && (!earliestPay || pm < earliestPay)) earliestPay = pm;
  }
  if (created && earliestPay) return created < earliestPay ? created : earliestPay;
  return created ?? earliestPay;
}

function emptyChannelTotals(): ChannelCurrencyTotals {
  return { USD: 0, CAD: 0, PKR: 0 };
}

function entrySummary(e: ProjectPaymentEntry): PaymentEntrySummary {
  const channel = e.paymentChannel ?? null;
  const type = String(e.type ?? "Partial");
  const link = typeof e.link === "string" && e.link.trim() ? e.link.trim() : null;
  return {
    id: e.id,
    type,
    amount: e.amount,
    amountNum: parseMoney(e.amount),
    currency: e.currency ?? null,
    channel,
    channelLabel: channel ? PAYMENT_CHANNEL_LABELS[channel] : "—",
    link,
    paymentStatus: e.isPaid ? "Paid" : "Unpaid",
    accountsMonth: paymentAccountsMonth(e),
    paidAt: e.paidAt ?? null,
    createdAt: e.createdAt ?? null,
    isPartialType: type.toLowerCase().includes("partial") || type === "Milestone",
  };
}

/** Admin/Manager payment dashboard — KPIs, sources, partial/full projects. */
export async function buildPaymentsSummary(month?: string | null): Promise<PaymentsSummaryPayload> {
  const monthFilter =
    month && /^\d{4}-\d{2}$/.test(month.trim()) ? month.trim() : null;
  const thisMonthKey = monthFilter ?? currentMonthEst();
  const prevMonthKey = shiftMonth(thisMonthKey, -1);

  const rawLeads = await prisma.lead.findMany({
    where: buildProjectLeadWhere(),
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      projectTitle: true,
      projectCode: true,
      clientCode: true,
      projectBudget: true,
      projectPayments: true,
      status: true,
      inBin: true,
      createdAt: true,
      paymentDiscarded: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  const leads = rawLeads.filter(isDisplayableProjectLead);

  const channelMap = new Map<PaymentChannel, ChannelSummary & { projectIds: Set<string> }>();
  for (const ch of PAYMENT_CHANNELS) {
    channelMap.set(ch, {
      key: ch,
      label: PAYMENT_CHANNEL_LABELS[ch],
      totals: emptyChannelTotals(),
      totalAmount: 0,
      paymentCount: 0,
      projectCount: 0,
      activeCurrencies: [],
      pkrFormula: 0,
      projectIds: new Set(),
    });
  }

  const fullPaidProjects: ProjectPaymentSummaryRow[] = [];
  const partialPaidProjects: ProjectPaymentSummaryRow[] = [];
  const unpaidProjects: ProjectPaymentSummaryRow[] = [];

  let quotedProjects = 0;
  let collectedEntries = 0;
  let unassignedPaidCount = 0;
  let fullPaidCount = 0;
  let partialPaidCount = 0;
  let unpaidWithQuoteCount = 0;
  let collectedAllTime = 0;
  let outstandingAllTime = 0;
  let quotedThisMonth = 0;
  let quotedPrevMonth = 0;
  let collectedThisMonth = 0;
  let collectedPrevMonth = 0;
  let collectedOnPrevMonthProjects = 0;
  let cashThisMonth = 0;
  let collectedFromPending = 0;
  let outstandingThisMonth = 0;
  let outstandingPrevMonthOnly = 0;
  let outstandingPrevMonths = 0;
  const quotedListedIds = new Set<string>();
  const collectedByCurrency = emptyChannelTotals();
  let projectCount = 0;

  for (const lead of leads) {
    const allPayments = parseProjectPayments(lead.projectPayments);
    const quoted = parseMoney(lead.projectBudget);
    const paidTotalAllTime = paidTotalFromEntries(allPayments);
    const pctAllTime = paymentPercent(allPayments, lead.projectBudget);
    const remainingDue = quoted > 0 ? Math.max(0, quoted - paidTotalAllTime) : 0;
    const discarded = Boolean(lead.paymentDiscarded);

    const createdMonth = calendarMonthEst(lead.createdAt);
    const projectMonth = projectBusinessMonth(lead.createdAt, allPayments);

    /** Outstanding / unpaid-with-quote = invoices created in that month, still due. */
    if (quoted > 0) {
      if (!discarded && remainingDue > 0) {
        outstandingAllTime += remainingDue;
        if (createdMonth === thisMonthKey) outstandingThisMonth += remainingDue;
        else if (createdMonth && createdMonth < thisMonthKey) {
          outstandingPrevMonths += remainingDue;
          if (createdMonth === prevMonthKey) outstandingPrevMonthOnly += remainingDue;
        }
      }
    }

    /**
     * Payment date decides when cash landed.
     * Closed month (e.g. August): Collected = all cash dated that month.
     * Current month (September): Collected = only this month’s projects;
     *   cash on older projects → “Prev month collected”, not the big card.
     */
    for (const entry of allPayments) {
      if (!entry.isPaid) continue;
      const amt = parseMoney(entry.amount);
      if (amt <= 0) continue;
      const payMonth = paymentDateMonth(entry);
      collectedAllTime += amt;

      if (payMonth === thisMonthKey && projectMonth && projectMonth <= thisMonthKey) {
        cashThisMonth += amt;
      }
      if (payMonth === thisMonthKey && projectMonth === thisMonthKey) collectedThisMonth += amt;
      if (payMonth === prevMonthKey && projectMonth === prevMonthKey) collectedOnPrevMonthProjects += amt;
      if (payMonth === thisMonthKey && projectMonth && projectMonth < thisMonthKey) {
        collectedPrevMonth += amt;
      }

      if (projectMonth && projectMonth < thisMonthKey) collectedFromPending += amt;

      const inCollectedView = !monthFilter
        ? true
        : payMonth === monthFilter && Boolean(projectMonth && projectMonth <= monthFilter);
      if (!inCollectedView) continue;

      collectedEntries += 1;
      if (!entry.paymentChannel || !entry.currency) {
        unassignedPaidCount += 1;
        continue;
      }
      const ch = channelMap.get(entry.paymentChannel);
      if (!ch) continue;
      ch.paymentCount += 1;
      ch.totals[entry.currency] += amt;
      ch.totalAmount += amt;
      ch.projectIds.add(lead.id);
      collectedByCurrency[entry.currency] += amt;
      if (!ch.activeCurrencies.includes(entry.currency)) {
        ch.activeCurrencies.push(entry.currency);
      }
    }

    const hasCashInViewMonth = monthFilter
      ? allPayments.some((e) => e.isPaid && parseMoney(e.amount) > 0 && paymentDateMonth(e) === monthFilter)
      : paidTotalAllTime > 0;
    const showCollected = !monthFilter || hasCashInViewMonth;
    const showUnpaidInvoice = quoted > 0 && remainingDue > 0;

    if (monthFilter) {
      if (!showCollected && !showUnpaidInvoice) continue;
    } else if (quoted <= 0 && allPayments.length === 0) {
      continue;
    }

    const monthPayments = monthFilter
      ? allPayments.filter((e) => e.isPaid && paymentDateMonth(e) === monthFilter)
      : allPayments;
    const paidInMonth = monthPayments.reduce((s, e) => s + parseMoney(e.amount), 0);

    const rowPayments = monthPayments
      .map(entrySummary)
      .sort((a, b) => {
        const ta = a.paidAt || a.createdAt || "";
        const tb = b.paidAt || b.createdAt || "";
        return tb.localeCompare(ta);
      });

    const status: ProjectPaymentSummaryRow["status"] =
      pctAllTime >= 100
        ? "full"
        : paidTotalAllTime > 0
          ? "partial"
          : "unpaid";

    const paidTotalDisplay = monthFilter ? paidInMonth : paidTotalAllTime;

    const row: ProjectPaymentSummaryRow = {
      leadId: lead.id,
      projectCode: lead.projectCode || lead.clientCode || null,
      projectTitle: lead.projectTitle ?? null,
      clientName: (lead.name || lead.company || "").trim() || null,
      clientEmail: (lead.email || "").trim() || null,
      quoted,
      quotedLabel: quoted > 0 ? `$${quoted.toLocaleString()}` : "—",
      paidTotal: paidTotalDisplay,
      paidLabel: paidTotalDisplay > 0 ? `$${paidTotalDisplay.toLocaleString()}` : "—",
      percent: Math.round(pctAllTime * 10) / 10,
      status,
      discarded,
      remainingDue,
      payments: rowPayments,
    };

    if (showCollected) {
      projectCount += 1;

      if (quoted > 0 && !quotedListedIds.has(lead.id)) {
        quotedListedIds.add(lead.id);
        if (!monthFilter) quotedProjects += 1;
        else if (projectMonth === thisMonthKey) quotedProjects += 1;
      }

      if (status === "full") {
        if (paidTotalDisplay > 0) {
          fullPaidCount += 1;
          fullPaidProjects.push({
            ...row,
            rowKey: `${lead.id}-collected`,
            sumAmount: paidTotalDisplay,
          });
        }
      } else if (status === "partial" && paidTotalDisplay > 0) {
        partialPaidCount += 1;
        partialPaidProjects.push({
          ...row,
          rowKey: `${lead.id}-collected`,
          sumAmount: paidTotalDisplay,
        });
      }
    }

    if (showUnpaidInvoice) {
      if (status === "partial") {
        unpaidProjects.push({
          ...row,
          rowKey: `${lead.id}-unpaid`,
          status: "unpaid",
          sumAmount: remainingDue,
          unpaidFromPartial: true,
          payments: [],
        });
      } else if (status === "unpaid") {
        unpaidWithQuoteCount += 1;
        unpaidProjects.push({
          ...row,
          rowKey: `${lead.id}-unpaid`,
          sumAmount: quoted,
        });
      }
    }
  }

  quotedThisMonth = cashThisMonth + outstandingThisMonth;
  quotedPrevMonth = outstandingPrevMonthOnly;

  /* Nothing collected on this month’s projects → this month’s quote is still outstanding. */
  if (monthFilter && collectedThisMonth <= 0) {
    outstandingThisMonth = quotedThisMonth;
  }

  const collectedAmount = monthFilter
    ? collectedThisMonth + collectedPrevMonth
    : collectedAllTime;
  const outstandingAmount = monthFilter
    ? outstandingThisMonth + outstandingPrevMonths
    : outstandingAllTime;
  const quotedAmount = monthFilter
    ? quotedThisMonth + quotedPrevMonth
    : collectedAllTime + outstandingAllTime;

  fullPaidProjects.sort((a, b) => b.paidTotal - a.paidTotal);
  partialPaidProjects.sort((a, b) => b.percent - a.percent || b.paidTotal - a.paidTotal);
  unpaidProjects.sort((a, b) => Number(a.discarded) - Number(b.discarded) || b.quoted - a.quoted);

  const channels: ChannelSummary[] = PAYMENT_CHANNELS.map((k) => {
    const ch = channelMap.get(k)!;
    ch.activeCurrencies.sort();
    const pkrFormula = paymentsChannelPkr(k, ch.totals);
    const activeCurrencies = [...ch.activeCurrencies];
    if (pkrFormula > 0 && !activeCurrencies.includes("PKR")) activeCurrencies.push("PKR");
    return {
      key: ch.key,
      label: ch.label,
      totals: ch.totals,
      totalAmount: ch.totalAmount,
      paymentCount: ch.paymentCount,
      projectCount: ch.projectIds.size,
      activeCurrencies,
      pkrFormula,
    };
  });

  const collectionRate =
    quotedAmount > 0 ? Math.min(100, Math.round((collectedAmount / quotedAmount) * 1000) / 10) : 0;

  return {
    month: monthFilter,
    monthLabel: monthDisplayLabel(monthFilter),
    generatedAt: new Date().toISOString(),
    channels,
    totals: {
      projectCount,
      quotedProjects,
      quotedAmount,
      collectedAmount,
      collectedByCurrency,
      outstandingAmount,
      collectionRate,
      collectedEntries,
      unassignedPaidCount,
      fullPaidCount,
      partialPaidCount,
      unpaidWithQuoteCount,
      thisMonth: thisMonthKey,
      prevMonth: prevMonthKey,
      quotedThisMonth,
      quotedPrevMonth,
      collectedThisMonth,
      collectedPrevMonth,
      collectedFromPending,
      outstandingThisMonth,
      outstandingPrevMonths,
      outstandingPrevMonthOnly,
    },
    statusBreakdown: {
      paid: fullPaidCount,
      partial: partialPaidCount,
      unpaid: unpaidWithQuoteCount,
    },
    fullPaidProjects,
    partialPaidProjects,
    unpaidProjects,
  };
}
