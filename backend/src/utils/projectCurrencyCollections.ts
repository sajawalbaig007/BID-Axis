/**
 * Bridge: Admin/Manager project payments → Accounts dashboard currency tabs
 * (Ahmed Hamza / Sharjeel Nasir / Cheque / Habib Metro).
 *
 * Payments count by **calendar month** (`accountsMonth` / paidAt month),
 * not by individual day — so Accounts month view shows that month's total.
 */

import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { defaultAccountsData } from "./accountsDefaults";
import {
  parseMoney,
  parseProjectPayments,
  type PaymentChannel,
  type ProjectPaymentEntry,
} from "./projectPayments";

export type ChannelAmounts = { usdAmount: number; cadAmount: number; pkrAmount: number };

export type DayCollections = Record<PaymentChannel, ChannelAmounts>;

const CHANNELS: PaymentChannel[] = ["AH", "SN", "CHQ", "HM"];

export function emptyDayCollections(): DayCollections {
  return {
    AH: { usdAmount: 0, cadAmount: 0, pkrAmount: 0 },
    SN: { usdAmount: 0, cadAmount: 0, pkrAmount: 0 },
    CHQ: { usdAmount: 0, cadAmount: 0, pkrAmount: 0 },
    HM: { usdAmount: 0, cadAmount: 0, pkrAmount: 0 },
  };
}

/** Sum month/day collection buckets without double-counting keys. */
export function sumDayCollections(items: Iterable<DayCollections>): DayCollections {
  const out = emptyDayCollections();
  for (const item of items) {
    for (const ch of CHANNELS) {
      out[ch].usdAmount += item[ch].usdAmount;
      out[ch].cadAmount += item[ch].cadAmount;
      out[ch].pkrAmount += item[ch].pkrAmount;
    }
  }
  return out;
}

export function serializeChannelFx(col: DayCollections): Record<PaymentChannel, ChannelAmounts> {
  return {
    AH: { ...col.AH },
    SN: { ...col.SN },
    CHQ: { ...col.CHQ },
    HM: { ...col.HM },
  };
}

/** YYYY-MM for Accounts bucketing — payment date first, never falls back to “today”. */
export function paymentAccountsMonth(entry: ProjectPaymentEntry): string | null {
  if (!entry.isPaid) return null;
  const paid = entry.paidAt?.trim();
  if (paid && /^\d{4}-\d{2}/.test(paid)) return paid.slice(0, 7);
  const explicit = entry.accountsMonth?.trim();
  if (explicit && /^\d{4}-\d{2}$/.test(explicit)) return explicit;
  const created = entry.createdAt?.trim();
  if (created && /^\d{4}-\d{2}/.test(created)) return created.slice(0, 7);
  return null;
}

export function monthStartIso(yearMonth: string): string {
  return `${yearMonth}-01`;
}

/** Last calendar day of YYYY-MM, as YYYY-MM-DD. */
export function monthEndIso(yearMonth: string): string {
  const y = Number(yearMonth.slice(0, 4));
  const m = Number(yearMonth.slice(5, 7));
  if (!y || !m) return `${yearMonth}-28`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearMonth}-${String(last).padStart(2, "0")}`;
}

/** Latest row on or before a day. Rate-only saves count — amounts are filled from payments. */
export function pickLatestRecordOnOrBefore<T extends { recordDate: string }>(
  recs: T[],
  onOrBefore: string,
): T | undefined {
  let best: T | undefined;
  for (const rec of recs) {
    if (rec.recordDate > onOrBefore) continue;
    if (!best || rec.recordDate > best.recordDate) best = rec;
  }
  return best;
}

export function yearMonthFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Inclusive YYYY-MM list covering [fromIso, toIso]. */
export function yearMonthsInclusive(fromIso: string, toIso: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) return [];
  const start = fromIso <= toIso ? fromIso : toIso;
  const end = fromIso <= toIso ? toIso : fromIso;
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endY = Number(end.slice(0, 4));
  const endM = Number(end.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** @deprecated use paymentAccountsMonth — kept for call sites expecting a day */
export function paymentPaidDateIso(entry: ProjectPaymentEntry): string | null {
  const ym = paymentAccountsMonth(entry);
  return ym ? monthStartIso(ym) : null;
}

export function accumulatePaymentIntoDay(bucket: DayCollections, entry: ProjectPaymentEntry): void {
  if (!entry.isPaid) return;
  const channel = entry.paymentChannel;
  const currency = entry.currency;
  if (!channel || !currency) return;
  if (!CHANNELS.includes(channel)) return;
  if (currency !== "USD" && currency !== "CAD" && currency !== "PKR") return;
  const amt = parseMoney(entry.amount);
  if (amt <= 0) return;
  if (currency === "USD") bucket[channel].usdAmount += amt;
  else if (currency === "CAD") bucket[channel].cadAmount += amt;
  else bucket[channel].pkrAmount += amt;
}

/** Month-start dates (YYYY-MM-01) affected by these payments — for Accounts sync. */
export function paidDatesFromPayments(entries: ProjectPaymentEntry[]): string[] {
  const months = new Set<string>();
  for (const e of entries) {
    const ym = paymentAccountsMonth(e);
    if (ym) months.add(monthStartIso(ym));
  }
  return [...months];
}

type TabLike = {
  usdAmount?: number;
  cadAmount?: number;
  pkrAmount?: number;
  usdToPkrRate?: number;
  cadToPkrRate?: number;
  usdTaxFactor?: number;
  cadTaxFactor?: number;
  taxDeductionRate?: number;
};

function isLocalChannel(ch: PaymentChannel): boolean {
  return ch === "CHQ" || ch === "HM";
}

/** Overwrite USD/CAD/PKR collected amounts from project payments; keep rates / tax factors. */
export function applyCollectionsToDashboardData(
  data: Record<string, unknown>,
  collections: DayCollections,
): Record<string, unknown> {
  const currency = (data.currency as Record<string, unknown> | undefined) ?? {};
  const tabs = { ...((currency.tabs as Record<string, TabLike> | undefined) ?? {}) };

  for (const ch of CHANNELS) {
    const prev = { ...(tabs[ch] ?? {}) };
    const col = collections[ch];
    if (isLocalChannel(ch)) {
      const usdRate = Number(prev.usdToPkrRate) || 280;
      const cadRate = Number(prev.cadToPkrRate) || 200;
      const pkrFromFx = col.usdAmount * usdRate + col.cadAmount * cadRate;
      tabs[ch] = {
        ...prev,
        usdAmount: 0,
        cadAmount: 0,
        pkrAmount: col.pkrAmount + pkrFromFx,
      };
    } else {
      tabs[ch] = {
        ...prev,
        usdAmount: col.usdAmount,
        cadAmount: col.cadAmount,
        pkrAmount: col.pkrAmount,
      };
    }
  }

  return {
    ...data,
    currency: {
      ...currency,
      tabs,
    },
  };
}

async function loadAllPaymentEntries(): Promise<ProjectPaymentEntry[]> {
  const leads = await prisma.lead.findMany({
    where: { projectPayments: { not: null } },
    select: { projectPayments: true },
  });
  const out: ProjectPaymentEntry[] = [];
  for (const lead of leads) {
    out.push(...parseProjectPayments(lead.projectPayments));
  }
  return out;
}

export type CollectionLine = {
  client: string;
  projectCode: string;
  channel: PaymentChannel;
  currency: "USD" | "CAD" | "PKR";
  amount: number;
  paidAt: string;
  type: string;
};

const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  AH: "Ahmed Hamza",
  SN: "Sharjeel Nasir",
  CHQ: "Cheque",
  HM: "Habib Metro",
};

/** Every paid project payment that counts in this calendar month. */
export async function listPaidCollectionsForMonth(yearMonth: string): Promise<(CollectionLine & { channelLabel: string })[]> {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return [];
  const leads = await prisma.lead.findMany({
    where: { projectPayments: { not: null } },
    select: {
      name: true,
      company: true,
      projectTitle: true,
      projectCode: true,
      clientCode: true,
      projectPayments: true,
    },
  });
  const out: (CollectionLine & { channelLabel: string })[] = [];
  for (const lead of leads) {
    const client = String(lead.company || lead.name || lead.projectTitle || "—").trim() || "—";
    const projectCode = String(lead.projectCode || lead.clientCode || "").trim();
    for (const entry of parseProjectPayments(lead.projectPayments)) {
      if (!entry.isPaid) continue;
      if (paymentAccountsMonth(entry) !== yearMonth) continue;
      if (!entry.paymentChannel || !entry.currency) continue;
      const amount = parseMoney(entry.amount);
      if (amount <= 0) continue;
      out.push({
        client,
        projectCode,
        channel: entry.paymentChannel,
        channelLabel: CHANNEL_LABEL[entry.paymentChannel],
        currency: entry.currency,
        amount,
        paidAt: String(entry.paidAt || entry.accountsMonth || ""),
        type: String(entry.type || "").trim(),
      });
    }
  }
  out.sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.client.localeCompare(b.client));
  return out;
}

/** All paid project payments that belong to this calendar month (YYYY-MM). */
export async function aggregateCollectionsForMonth(yearMonth: string): Promise<DayCollections> {
  const bucket = emptyDayCollections();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return bucket;
  const entries = await loadAllPaymentEntries();
  for (const entry of entries) {
    if (paymentAccountsMonth(entry) !== yearMonth) continue;
    accumulatePaymentIntoDay(bucket, entry);
  }
  return bucket;
}

/**
 * Aggregate for a dashboard record date — uses that date's **month** total
 * (all payments in YYYY-MM of recordDate).
 */
export async function aggregateCollectionsForDate(recordDate: string): Promise<DayCollections> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) return emptyDayCollections();
  return aggregateCollectionsForMonth(yearMonthFromDate(recordDate));
}

/**
 * Aggregate for many record dates. Keys stay as the given dates, but each value
 * is that date's month total. Prefer `aggregateCollectionsForMonths` for summaries
 * to avoid double-counting the same month.
 */
export async function aggregateCollectionsForDates(
  dates: string[],
): Promise<Map<string, DayCollections>> {
  const unique = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  const map = new Map<string, DayCollections>();
  if (unique.length === 0) return map;

  const months = [...new Set(unique.map(yearMonthFromDate))];
  const byMonth = await aggregateCollectionsForMonths(months);
  for (const d of unique) {
    map.set(d, byMonth.get(yearMonthFromDate(d)) ?? emptyDayCollections());
  }
  return map;
}

/** One bucket per YYYY-MM — safe for all-time / range totals without double-count. */
export async function aggregateCollectionsForMonths(
  yearMonths: string[],
): Promise<Map<string, DayCollections>> {
  const unique = [...new Set(yearMonths.filter((m) => /^\d{4}-\d{2}$/.test(m)))];
  const map = new Map<string, DayCollections>();
  for (const m of unique) map.set(m, emptyDayCollections());
  if (unique.length === 0) return map;

  const monthSet = new Set(unique);
  const entries = await loadAllPaymentEntries();
  for (const entry of entries) {
    const ym = paymentAccountsMonth(entry);
    if (!ym || !monthSet.has(ym)) continue;
    accumulatePaymentIntoDay(map.get(ym)!, entry);
  }
  return map;
}

/** Every calendar month that has at least one paid project collection. */
export async function aggregateAllCollectionMonths(): Promise<Map<string, DayCollections>> {
  const map = new Map<string, DayCollections>();
  const entries = await loadAllPaymentEntries();
  for (const entry of entries) {
    const ym = paymentAccountsMonth(entry);
    if (!ym) continue;
    if (!map.has(ym)) map.set(ym, emptyDayCollections());
    accumulatePaymentIntoDay(map.get(ym)!, entry);
  }
  return map;
}

/**
 * Persist month totals onto Accounts dashboard at YYYY-MM-01 for each affected month.
 * Rates/tax on existing records are preserved.
 */
export async function syncAccountsCurrencyForDates(
  dates: string[],
  userId?: string | null,
): Promise<void> {
  const months = [
    ...new Set(
      dates
        .map((d) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return yearMonthFromDate(d);
          if (/^\d{4}-\d{2}$/.test(d)) return d;
          return "";
        })
        .filter(Boolean),
    ),
  ];
  if (months.length === 0) return;

  const byMonth = await aggregateCollectionsForMonths(months);

  for (const yearMonth of months) {
    const recordDate = monthStartIso(yearMonth);
    const collections = byMonth.get(yearMonth) ?? emptyDayCollections();
    const existing = await prisma.accountsRecord.findUnique({
      where: { page_recordDate: { page: "dashboard", recordDate } },
    });
    const base =
      (existing?.data as Record<string, unknown> | undefined) ??
      defaultAccountsData("dashboard");
    const merged = applyCollectionsToDashboardData(base, collections);

    await prisma.accountsRecord.upsert({
      where: { page_recordDate: { page: "dashboard", recordDate } },
      create: {
        page: "dashboard",
        recordDate,
        data: merged as Prisma.InputJsonValue,
        updatedBy: userId ?? null,
      },
      update: {
        data: merged as Prisma.InputJsonValue,
        updatedBy: userId ?? null,
      },
    });
  }
}
