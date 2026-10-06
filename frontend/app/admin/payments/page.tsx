"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import {
  AlertCircle,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  ExternalLink,
  Eye,
  Loader2,
  Percent,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Cell, Pie, PieChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import API, { apiErrorMessage } from "@/lib/api";
import { useOpenCrmMail } from "@/app/components/mail/CrmMailProvider";
import { peekAuthMe } from "@/lib/authMeCache";
import ProjectWorkbenchModal from "@/app/components/projects/ProjectWorkbenchModal";
import {
  CSR_ASSIGN_OTHER,
  emptyWorkbench,
  formatPaymentDateOnly,
  parsePayments,
  paymentCalendarDay,
  type ProjectWorkbenchData,
} from "@/lib/projectFields";
import { StaffSidebar } from "@/app/hooks/useStaffSidebar";
import DashboardNavbar from "@/app/admin/components/layout/Navbar";
import RechartsBox from "@/app/components/charts/RechartsBox";
import {
  CHANNEL_STYLES,
  currentMonthIso,
  fetchPaymentsSummary,
  formatMoney,
  formatMoneyAlways,
  type ChannelCurrencyTotals,
  type PaymentEntrySummary,
  type PaymentsSummaryPayload,
  type ProjectPaymentSummaryRow,
} from "@/lib/paymentsSummary";

const BENTO =
  "rounded-[1.5rem] sm:rounded-[1.75rem] border border-gray-100/90 dark:border-crm-border bg-white dark:bg-crm-surface shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)]";

const STATUS_COLORS = {
  paid: "#22C55E",
  partial: "#F59E0B",
  unpaid: "#EF4444",
};

const CURRENCY_ORDER = ["USD", "CAD", "PKR"] as const;

function formatPaymentDate(iso: string | null | undefined): string {
  return formatPaymentDateOnly(iso ?? undefined);
}

function normalizeDateRange(from: string, to: string): { from: string; to: string } {
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

function paidAtInRange(paidAt: string | null | undefined, from: string, to: string): boolean {
  const day = paymentCalendarDay(paidAt);
  if (!day) return false;
  const range = normalizeDateRange(from, to);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

function filterRowsByPaymentDate(
  rows: ProjectPaymentSummaryRow[],
  from: string,
  to: string,
): ProjectPaymentSummaryRow[] {
  if (!from && !to) return rows;
  return rows.flatMap((row) => {
    const payments = row.payments.filter((p) => paidAtInRange(p.paidAt, from, to));
    if (payments.length === 0) return [];
    const paid = payments.reduce((s, p) => s + (p.amountNum ?? 0), 0);
    return [{
      ...row,
      payments,
      paidTotal: paid,
      paidLabel: paid > 0 ? `$${paid.toLocaleString()}` : "—",
      sumAmount: paid,
    }];
  });
}

type LeadForWorkbench = {
  id: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  ownerName?: string | null;
  state?: string | null;
  projectCode?: string | null;
  clientCode?: string | null;
  projectTitle?: string | null;
  projectScope?: string | null;
  interestedService?: string | null;
  projectBudget?: string | null;
  projectDeadline?: string | null;
  deadlineTiming?: string | null;
  projectPhase?: string | null;
  takeoffDeadline?: string | null;
  pricingDeadline?: string | null;
  qaDeadline?: string | null;
  projectPayments?: unknown;
  projectSource?: string | null;
  createdAt?: string | null;
  assignedTo?: string | null;
  csr?: { id: string; name?: string; csrCode?: string | null } | null;
};

function leadToWorkbench(lead: LeadForWorkbench): ProjectWorkbenchData {
  const isOther = !!lead.projectSource?.trim();
  return {
    id: lead.id,
    name: lead.name ?? "",
    company: lead.company ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    ownerName: lead.ownerName ?? "",
    state: lead.state ?? "",
    projectCode: lead.projectCode || lead.clientCode || "",
    projectTitle: lead.projectTitle ?? "",
    projectScope: lead.projectScope ?? "",
    interestedService: lead.interestedService ?? "",
    projectBudget: lead.projectBudget ?? "",
    projectDeadline: (lead.projectDeadline ?? "").split("T")[0] ?? "",
    deadlineTiming:
      lead.deadlineTiming === "morning" || lead.deadlineTiming === "cob"
        ? lead.deadlineTiming
        : "",
    projectPhase: lead.projectPhase ?? "not_started",
    takeoffDeadline: lead.takeoffDeadline ?? "",
    pricingDeadline: lead.pricingDeadline ?? "",
    qaDeadline: lead.qaDeadline ?? "",
    projectPayments: parsePayments(lead.projectPayments),
    assignedTo: isOther ? CSR_ASSIGN_OTHER : (lead.csr?.id ?? lead.assignedTo ?? ""),
    projectSource: lead.projectSource ?? "",
    csrName: lead.csr?.name,
    csrCode: isOther ? null : lead.csr?.csrCode,
    projectCreatedAt: lead.createdAt ?? "",
  };
}

/** Accounts receive month (YYYY-MM) — separate from payment paidAt. */
function formatReceiveDate(month: string | null | undefined): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return "—";
  const [y, mo] = month.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Always show USD / CAD / PKR separately inside one source card. */
function CurrencyBreakdown({
  totals,
  accent,
  pkrFormula,
}: {
  totals: ChannelCurrencyTotals;
  accent?: string;
  pkrFormula?: number;
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {CURRENCY_ORDER.map((key) => {
        const value = key === "PKR" && (pkrFormula ?? 0) > 0 ? pkrFormula! : (totals[key] ?? 0);
        const active = value > 0;
        return (
          <div
            key={key}
            className={`rounded-xl border px-2 py-2 text-center ${
              active
                ? "bg-crm-surface border-crm-border shadow-sm"
                : "bg-crm-muted/40 border-transparent opacity-60"
            }`}
          >
            <p
              className="text-[9px] font-extrabold uppercase tracking-wider"
              style={{ color: active && accent ? accent : undefined }}
            >
              <span className={active ? "" : "text-crm-text-faint"}>{key}</span>
            </p>
            <p
              className={`mt-0.5 text-[11px] sm:text-xs font-bold tabular-nums leading-tight ${
                active ? "text-crm-text" : "text-crm-text-faint"
              }`}
            >
              {active ? formatMoneyAlways(value, key) : "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CurrencyLines({
  totals,
}: {
  totals: { USD: number; CAD: number; PKR: number };
}) {
  const rows = CURRENCY_ORDER.map((key) => ({ key, value: totals[key] })).filter((r) => r.value > 0);

  if (rows.length === 0) {
    return <p className="text-[11px] text-crm-text-faint mt-1">No currency yet</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <span
          key={r.key}
          className="inline-flex items-center gap-1 rounded-lg border border-crm-border-subtle bg-crm-surface px-2 py-1 text-[11px] tabular-nums"
        >
          <span className="font-extrabold text-crm-text-faint uppercase">{r.key}</span>
          <span className="font-bold text-crm-text">{formatMoneyAlways(r.value, r.key)}</span>
        </span>
      ))}
    </div>
  );
}

function MonthCompare({
  thisLabel = "This month",
  prevLabel = "Prev month",
  thisValue,
  prevValue,
  thisClass,
  prevClass,
}: {
  thisLabel?: string;
  prevLabel?: string;
  thisValue: number;
  prevValue: number;
  thisClass: string;
  prevClass: string;
}) {
  return (
    <div className="mt-3 pt-3 border-t border-crm-border-subtle space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-crm-text-muted">{thisLabel}</span>
        <span className={`font-bold tabular-nums ${thisClass}`}>{formatMoneyAlways(thisValue)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-crm-text-muted">{prevLabel}</span>
        <span className={`font-bold tabular-nums ${prevClass}`}>{formatMoneyAlways(prevValue)}</span>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  accent,
  children,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  accent: string;
  children?: React.ReactNode;
  icon: typeof DollarSign;
}) {
  return (
    <div className={`${BENTO} relative p-4 sm:p-5 flex flex-col min-h-[132px]`}>
      <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-2 pl-1">
        <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-crm-text-muted">
          {title}
        </p>
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ background: accent }}
        >
          <Icon size={15} />
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-crm-text tracking-tight tabular-nums mt-2 leading-none pl-1">
        {value}
      </p>
      <p className="text-[11px] text-gray-400 dark:text-crm-text-faint mt-1.5 pl-1">{hint}</p>
      <div className="pl-1 mt-auto">{children}</div>
    </div>
  );
}

function paymentStatusBadge(pay: PaymentEntrySummary) {
  if (pay.paymentStatus === "Paid") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300";
  }
  return "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300";
}

function collectedCapsule(status: ProjectPaymentSummaryRow["status"]) {
  if (status === "full") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300";
  }
  if (status === "partial") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300";
  }
  return "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300";
}

function collectedLabel(status: ProjectPaymentSummaryRow["status"]) {
  if (status === "full") return "Full paid";
  if (status === "partial") return "Partial paid";
  return "Unpaid";
}

function ProjectList({
  title,
  subtitle,
  rows,
  tone,
  emptyText,
  perRowStatus = false,
  canDiscard = false,
  onDiscard,
  onView,
  viewingLeadId,
}: {
  title: string;
  subtitle: string;
  rows: ProjectPaymentSummaryRow[];
  tone: "emerald" | "amber" | "red";
  emptyText: string;
  perRowStatus?: boolean;
  canDiscard?: boolean;
  onDiscard?: (leadId: string, discarded: boolean) => void;
  onView?: (leadId: string) => void;
  viewingLeadId?: string | null;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const openCompose = useOpenCrmMail();
  const tableSum = rows.reduce((s, r) => {
    if (r.discarded) return s;
    const amt =
      r.sumAmount ??
      (r.unpaidFromPartial
        ? (r.remainingDue ?? Math.max(0, r.quoted - r.paidTotal))
        : r.status === "unpaid"
          ? r.quoted
          : r.paidTotal);
    return s + amt;
  }, 0);
  const toneCls =
    tone === "emerald"
      ? "border-emerald-100 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-500/10"
      : tone === "amber"
        ? "border-amber-100 bg-amber-50/40 dark:border-amber-500/20 dark:bg-amber-500/10"
        : "border-red-100 bg-red-50/40 dark:border-red-500/20 dark:bg-red-500/10";
  const badgeCls =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300";

  return (
    <section className={`${BENTO} overflow-hidden`}>
      <div className={`px-4 sm:px-5 py-4 border-b ${toneCls}`}>
        <h2 className="text-sm font-bold text-crm-text flex items-center gap-2">
          {tone === "emerald" ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : tone === "amber" ? (
            <AlertCircle size={16} className="text-amber-600" />
          ) : (
            <AlertCircle size={16} className="text-red-600" />
          )}
          {title}
          <span className={`ml-1 text-[11px] font-bold px-2 py-0.5 rounded-lg ${badgeCls}`}>
            {rows.length}
          </span>
        </h2>
        <p className="text-[11px] text-crm-text-muted mt-0.5">{subtitle}</p>
        {rows.length > 0 ? (
          <p className="text-sm font-extrabold tabular-nums text-crm-text mt-1.5">
            Sum {formatMoneyAlways(tableSum)}
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-crm-text-faint">{emptyText}</p>
      ) : (
        <div className="divide-y divide-crm-border-subtle max-h-[560px] overflow-y-auto">
          {rows.map((p) => {
            const rowKey = p.rowKey || p.leadId;
            const open = expanded[rowKey] ?? false;
            const remaining = p.remainingDue ?? Math.max(0, p.quoted - p.paidTotal);
            const canExpand = p.payments.length > 0;
            const detailRows =
              p.payments.length > 0
                ? p.payments
                : [
                    {
                      id: `${rowKey}-empty`,
                      type: "—",
                      amount: "",
                      amountNum: 0,
                      currency: null,
                      channel: null,
                      channelLabel: "—",
                      link: null,
                      paymentStatus: "Unpaid" as const,
                      paidAt: null,
                      createdAt: null,
                      accountsMonth: null,
                      isPartialType: false,
                    },
                  ];

            return (
              <div
                key={rowKey}
                className={`px-3 sm:px-4 py-3 ${p.discarded ? "opacity-45 grayscale" : ""}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!canExpand) return;
                    setExpanded((prev) => ({ ...prev, [rowKey]: !open }));
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.projectCode ? (
                        <span className="text-[10px] font-bold text-[#1B6FE8] bg-[#EAF2FE] dark:bg-crm-brand-soft px-1.5 py-0.5 rounded">
                          {p.projectCode}
                        </span>
                      ) : null}
                      <span className="font-semibold text-sm text-crm-text truncate">
                        {p.projectTitle || "Untitled"}
                      </span>
                    </div>
                    <p className="text-[11px] text-crm-text-muted mt-0.5 truncate">
                      {p.clientName || "—"}
                      {p.clientEmail ? ` · ${p.clientEmail}` : ""}
                    </p>
                    <p className="text-[11px] text-crm-text-faint mt-0.5">
                      {p.unpaidFromPartial
                        ? `Quoted ${p.quotedLabel} · Remaining ${formatMoneyAlways(remaining)} · Paid ${p.paidLabel}`
                        : `Quoted ${p.quotedLabel} · Collected ${p.paidLabel} · ${p.percent}%`}
                      {p.discarded ? " · Payment not expected" : ""}
                    </p>
                  </div>
                </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.unpaidFromPartial ? (
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full ${collectedCapsule("unpaid")}`}>
                        Remaining
                        <span className="opacity-80">·</span>
                        {formatMoneyAlways(remaining)}
                      </span>
                    ) : perRowStatus || p.status === "unpaid" ? (
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full ${collectedCapsule(p.status)}`}>
                        {collectedLabel(p.status)}
                        <span className="opacity-80">·</span>
                        {p.paidLabel}
                        <span className="opacity-80">·</span>
                        {p.percent}%
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${badgeCls}`}>
                        {p.payments.length} payment{p.payments.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {p.payments.length > 1 ? (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-crm-text text-white"
                        title={`${p.payments.length - 1} older payment(s) in history`}
                      >
                        +{p.payments.length - 1}
                      </span>
                    ) : null}
                    {onView ? (
                      <button
                        type="button"
                        onClick={() => onView(p.leadId)}
                        disabled={viewingLeadId === p.leadId}
                        className="h-8 w-8 rounded-xl border border-crm-border bg-crm-surface text-crm-text-muted hover:text-[#1B6FE8] hover:border-[#1B6FE8]/40 inline-flex items-center justify-center disabled:opacity-50"
                        title="View / edit payment details"
                        aria-label="View payment details"
                      >
                        {viewingLeadId === p.leadId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    ) : null}
                    {canDiscard && p.status === "unpaid" && !p.unpaidFromPartial ? (
                      <button
                        type="button"
                        onClick={() => onDiscard?.(p.leadId, !p.discarded)}
                        className={`h-8 px-2.5 rounded-xl text-[10px] font-bold inline-flex items-center gap-1 border ${
                          p.discarded
                            ? "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                        title={p.discarded ? "Payment may still come — undo discard" : "No further payment expected"}
                      >
                        <Ban size={11} />
                        {p.discarded ? "Undo" : "Discard"}
                      </button>
                    ) : null}
                    {canExpand ? (
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [rowKey]: !open }))}
                      className="p-1"
                      aria-label={open ? "Collapse" : "Expand"}
                    >
                    <ChevronDown
                      size={14}
                      className={`text-crm-text-faint transition-transform ${open ? "rotate-180" : ""}`}
                    />
                    </button>
                    ) : null}
                  </div>
                </div>

                {open && canExpand ? (
                  <div className="mt-3 rounded-xl border border-crm-border-subtle overflow-hidden bg-crm-surface-muted/40">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] min-w-[980px]">
                        <thead>
                          <tr className="bg-crm-surface-muted text-crm-text-faint border-b border-crm-border-subtle">
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Proj code
                            </th>
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Client name
                            </th>
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Client email
                            </th>
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Payment link
                            </th>
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Status
                            </th>
                            <th className="px-2.5 py-2 text-right font-bold uppercase tracking-wide whitespace-nowrap">
                              Amount
                            </th>
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Payment date
                            </th>
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Source
                            </th>
                            <th className="px-2.5 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">
                              Receive date
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailRows.map((pay) => (
                            <tr
                              key={pay.id}
                              className="border-b border-crm-border-subtle last:border-0 bg-crm-surface"
                            >
                              <td className="px-2.5 py-2.5 font-bold text-[#1B6FE8] whitespace-nowrap align-top">
                                {p.projectCode || "—"}
                              </td>
                              <td className="px-2.5 py-2.5 text-crm-text font-medium max-w-[140px] truncate align-top" title={p.clientName ?? undefined}>
                                {p.clientName || "—"}
                              </td>
                              <td className="px-2.5 py-2.5 text-crm-text-secondary max-w-[160px] truncate align-top" title={p.clientEmail ?? undefined}>
                                {p.clientEmail ? (
                                  <button
                                    type="button"
                                    className="text-sky-700 hover:underline text-left truncate max-w-full"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCompose?.({
                                        to: p.clientEmail!,
                                        clientName: p.clientName ?? undefined,
                                      });
                                    }}
                                  >
                                    {p.clientEmail}
                                  </button>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                {pay.link ? (
                                  <a
                                    href={/^https?:\/\//i.test(pay.link) ? pay.link : `https://${pay.link}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 font-semibold text-[#1B6FE8] hover:underline max-w-[160px]"
                                    title={pay.link}
                                  >
                                    <ExternalLink size={11} className="shrink-0" />
                                    <span className="truncate">{pay.link}</span>
                                  </a>
                                ) : (
                                  <span className="text-crm-text-faint">—</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 align-top whitespace-nowrap">
                                <span
                                  className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md ${paymentStatusBadge(pay)}`}
                                >
                                  {pay.paymentStatus}
                                </span>
                                {pay.type && pay.type !== "—" ? (
                                  <span className="ml-1 text-crm-text-faint">{pay.type}</span>
                                ) : null}
                              </td>
                              <td className="px-2.5 py-2.5 text-right font-bold tabular-nums text-emerald-700 align-top whitespace-nowrap">
                                {pay.amountNum > 0
                                  ? formatMoney(pay.amountNum, pay.currency)
                                  : "—"}
                              </td>
                              <td className="px-2.5 py-2.5 text-crm-text-secondary whitespace-nowrap align-top">
                                {formatPaymentDate(pay.paidAt)}
                              </td>
                              <td className="px-2.5 py-2.5 text-crm-text-secondary whitespace-nowrap align-top">
                                {pay.channel ? (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="font-bold text-crm-text">{pay.channel}</span>
                                    <span className="text-crm-text-faint">{pay.channelLabel}</span>
                                    {pay.currency ? (
                                      <span className="text-[10px] font-bold text-crm-text-muted">
                                        · {pay.currency}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-red-700 bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 rounded">
                                    No source
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 text-crm-text-secondary whitespace-nowrap align-top">
                                {formatReceiveDate(pay.accountsMonth)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="px-3 py-1.5 text-[10px] text-crm-text-faint border-t border-crm-border-subtle">
                      Payment date = when marked paid · Receive date = Accounts month (books separately)
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function AdminPaymentsPage() {
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/manager") ? "/manager" : "/admin";
  const canDiscard = peekAuthMe()?.role === "admin";

  const [month, setMonth] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<PaymentsSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [workbench, setWorkbench] = useState<ProjectWorkbenchData | null>(null);
  const [workbenchSaving, setWorkbenchSaving] = useState(false);
  const [viewingLeadId, setViewingLeadId] = useState<string | null>(null);
  const [csrs, setCsrs] = useState<{ id: string; name: string; csrCode?: string | null }[]>([]);
  const dateRangeActive = Boolean(dateFrom || dateTo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPaymentsSummary(month || null);
      setData(res);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load payments summary"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchPaymentsSummary(month || null);
        if (cancelled) return;
        setData(res);
      } catch (err) {
        if (cancelled) return;
        toast.error(apiErrorMessage(err, "Failed to load payments summary"));
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const openProjectEdit = async (leadId: string) => {
    setViewingLeadId(leadId);
    try {
      const [leadRes, csrRes] = await Promise.all([
        API.get(`/admin/lead/${leadId}`),
        csrs.length
          ? Promise.resolve({ data: { csrs } })
          : API.get("/admin/csrs").catch(() => ({ data: { csrs: [] } })),
      ]);
      const lead = leadRes.data?.lead as LeadForWorkbench | undefined;
      if (!lead?.id) throw new Error("not found");
      if (!csrs.length) setCsrs((csrRes.data?.csrs ?? []) as typeof csrs);
      setWorkbench(leadToWorkbench(lead));
    } catch {
      toast.error("Could not load project payment details.");
    } finally {
      setViewingLeadId(null);
    }
  };

  const saveWorkbench = async (form: ProjectWorkbenchData) => {
    setWorkbenchSaving(true);
    try {
      const isOther = form.assignedTo === CSR_ASSIGN_OTHER;
      await API.put(`/admin/project/${form.id}`, {
        name: form.name,
        company: form.company,
        phone: form.phone,
        email: form.email,
        ownerName: form.ownerName,
        state: form.state,
        projectCode: form.projectCode,
        projectTitle: form.projectTitle,
        projectScope: form.projectScope,
        interestedService: form.interestedService,
        projectBudget: form.projectBudget,
        projectDeadline: form.projectDeadline,
        deadlineTiming: form.deadlineTiming || "",
        projectPhase: form.projectPhase,
        takeoffDeadline: form.takeoffDeadline,
        pricingDeadline: form.pricingDeadline,
        qaDeadline: form.qaDeadline,
        projectPayments: form.projectPayments,
        assignedTo: isOther ? undefined : form.assignedTo,
        projectSource: isOther ? form.projectSource : "",
      });
      setWorkbench(form);
      toast.success("Payment details updated");
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to save payment details"));
    } finally {
      setWorkbenchSaving(false);
    }
  };

  const handleDiscard = async (leadId: string, discarded: boolean) => {
    try {
      await API.post(`/admin/project/${leadId}/discard-payment`, { discarded });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          unpaidProjects: prev.unpaidProjects
            .map((r) => (r.leadId === leadId ? { ...r, discarded } : r))
            .sort((a, b) => Number(a.discarded) - Number(b.discarded) || b.quoted - a.quoted),
        };
      });
      toast.success(discarded ? "Project dimmed — payment not expected." : "Discard cleared.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update discard."));
    }
  };

  const t = data?.totals;
  const status = data?.statusBreakdown;
  const channels = data?.channels ?? [];

  const collectedRows = useMemo(() => {
    const rows = [
      ...(data?.fullPaidProjects ?? []),
      ...(data?.partialPaidProjects ?? []),
    ].sort((a, b) => b.percent - a.percent || b.paidTotal - a.paidTotal);
    return filterRowsByPaymentDate(rows, dateFrom, dateTo);
  }, [data, dateFrom, dateTo]);

  const unpaidRows = useMemo(() => {
    const rows = data?.unpaidProjects ?? [];
    if (!dateRangeActive) return rows;
    return filterRowsByPaymentDate(rows, dateFrom, dateTo);
  }, [data, dateFrom, dateTo, dateRangeActive]);

  const paymentDateLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return "";
    const { from, to } = normalizeDateRange(dateFrom, dateTo);
    if (from && to && from === to) return from;
    if (from && to) return `${from} → ${to}`;
    if (from) return `from ${from}`;
    return `through ${to}`;
  }, [dateFrom, dateTo]);

  const statusPie = useMemo(() => {
    if (!status) return [];
    return [
      { name: "Paid", value: status.paid, color: STATUS_COLORS.paid },
      { name: "Partial", value: status.partial, color: STATUS_COLORS.partial },
      { name: "Unpaid", value: status.unpaid, color: STATUS_COLORS.unpaid },
    ].filter((d) => d.value > 0);
  }, [status]);

  const sourceBars = useMemo(
    () =>
      channels.map((ch) => ({
        key: ch.key,
        name: ch.label.split(" ")[0] === "Ahmed" || ch.label.split(" ")[0] === "Sharjeel"
          ? ch.label.split(" ").slice(0, 2).join(" ")
          : ch.label,
        short: ch.key,
        amount: ch.totalAmount,
        fill: CHANNEL_STYLES[ch.key].color,
        payments: ch.paymentCount,
      })),
    [channels],
  );

  const lastUpdated = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="flex min-h-screen bg-[#EEF1F7] dark:bg-crm-bg-subtle">
      <Toaster position="top-right" />
      <StaffSidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <DashboardNavbar />
        <div className="w-full px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-4 sm:py-5 space-y-3.5 sm:space-y-4">
          {/* Header */}
          <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#1B6FE8] mb-1">
                <Wallet size={13} />
                Collections
              </div>
              <h1 className="text-xl sm:text-2xl md:text-[28px] font-bold text-crm-text tracking-tight">
                Payments Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-crm-text-muted mt-0.5 max-w-xl">
                Quoted · collected · outstanding · by source (Ahmed Hamza, Sharjeel Nasir, Cheque, Habib Metro)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-10 sm:h-11 px-3 rounded-xl border border-crm-border bg-crm-surface text-xs font-semibold text-crm-text-secondary inline-flex items-center gap-2 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {t?.projectCount ?? 0} projects · Updated {lastUpdated}
              </div>
              <Link
                href={`${basePath}/active-projects`}
                className="h-10 sm:h-11 px-4 rounded-xl border border-crm-border bg-crm-surface text-sm font-semibold text-crm-text-secondary inline-flex items-center justify-center hover:border-[#1B6FE8]/40"
              >
                Project DB
              </Link>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </header>

          {/* Filters */}
          <section className={`${BENTO} p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap`}>
            <div className="inline-flex p-1 rounded-full bg-crm-nav-pill border border-crm-border gap-1">
              <button
                type="button"
                onClick={() => setMonth("")}
                className={`h-8 px-3 rounded-full text-xs font-bold transition-colors ${
                  !month ? "bg-[#1B6FE8] text-white shadow-sm" : "text-crm-text-muted hover:text-crm-text"
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setMonth(currentMonthIso())}
                className={`h-8 px-3 rounded-full text-xs font-bold transition-colors ${
                  month === currentMonthIso()
                    ? "bg-[#1B6FE8] text-white shadow-sm"
                    : "text-crm-text-muted hover:text-crm-text"
                }`}
              >
                This Month
              </button>
            </div>
            <label className="flex items-center gap-2 h-10 px-3 rounded-xl border border-crm-border bg-crm-input text-sm font-semibold text-crm-text-secondary">
              <span className="text-[11px] text-crm-text-faint uppercase">Month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="outline-none bg-transparent text-sm font-semibold text-crm-text"
              />
            </label>
            <label className="flex items-center gap-2 h-10 px-3 rounded-xl border border-crm-border bg-crm-input text-sm font-semibold text-crm-text-secondary">
              <Calendar size={13} className="text-crm-text-faint shrink-0" />
              <span className="text-[11px] text-crm-text-faint uppercase">From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  if (e.target.value) setMonth("");
                }}
                className="outline-none bg-transparent text-sm font-semibold text-crm-text"
              />
            </label>
            <label className="flex items-center gap-2 h-10 px-3 rounded-xl border border-crm-border bg-crm-input text-sm font-semibold text-crm-text-secondary">
              <span className="text-[11px] text-crm-text-faint uppercase">To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  if (e.target.value) setMonth("");
                }}
                className="outline-none bg-transparent text-sm font-semibold text-crm-text"
              />
            </label>
            {dateRangeActive ? (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="h-10 px-3 rounded-xl border border-crm-border bg-crm-surface text-xs font-bold text-crm-text-muted hover:text-crm-text hover:border-[#1B6FE8]/40"
              >
                Clear dates
              </button>
            ) : null}
            <p className="text-xs text-crm-text-muted sm:ml-auto">
              Showing <span className="font-bold text-crm-text">{data?.monthLabel ?? "All time"}</span>
              {paymentDateLabel ? (
                <>
                  {" "}
                  · Payment date{" "}
                  <span className="font-bold text-crm-text">{paymentDateLabel}</span>
                </>
              ) : null}
              {t ? ` · ${t.projectCount} projects` : ""}
              {dateRangeActive ? ` · ${collectedRows.length} with payment in range` : ""}
            </p>
          </section>

          {(t?.unassignedPaidCount ?? 0) > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <span className="font-bold">{t!.unassignedPaidCount} paid entr{t!.unassignedPaidCount === 1 ? "y" : "ies"}</span>
                {" "}missing channel/currency — set in Project DB so source totals update.
              </p>
              <Link href={`${basePath}/active-projects`} className="text-xs font-bold text-[#1B6FE8] hover:underline shrink-0">
                Fix in Project DB →
              </Link>
            </div>
          ) : null}

          {/* KPI cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard
              title="Total Quoted"
              value={loading && !data ? "…" : formatMoneyAlways(t?.quotedAmount ?? 0)}
              hint={
                month
                  ? "This month + previous month unpaid"
                  : `${t?.quotedProjects ?? 0} projects with quote`
              }
              accent="#2563EB"
              icon={DollarSign}
            >
              <CurrencyLines
                totals={{
                  USD: t?.quotedAmount ?? 0,
                  CAD: 0,
                  PKR: 0,
                }}
              />
              <MonthCompare
                thisValue={t?.quotedThisMonth ?? 0}
                prevValue={t?.quotedPrevMonth ?? 0}
                prevLabel="Previous month unpaid"
                thisClass="text-blue-600"
                prevClass="text-violet-600"
              />
            </KpiCard>
            <KpiCard
              title="Collected"
              value={loading && !data ? "…" : formatMoneyAlways(t?.collectedAmount ?? 0)}
              hint={
                month
                  ? "This month collected + previous month collected"
                  : `${t?.collectedEntries ?? 0} payments`
              }
              accent="#059669"
              icon={TrendingUp}
            >
              {t?.collectedByCurrency ? <CurrencyLines totals={t.collectedByCurrency} /> : null}
              <MonthCompare
                thisLabel="This month collected"
                thisValue={t?.collectedThisMonth ?? 0}
                prevValue={t?.collectedPrevMonth ?? 0}
                prevLabel="Prev month collected"
                thisClass="text-emerald-600"
                prevClass="text-violet-600"
              />
            </KpiCard>
            <KpiCard
              title="Outstanding"
              value={loading && !data ? "…" : formatMoneyAlways(t?.outstandingAmount ?? 0)}
              hint={
                month
                  ? "This month outstanding + all-time outstanding"
                  : `${t?.unpaidWithQuoteCount ?? 0} unpaid · ${t?.partialPaidCount ?? 0} partial`
              }
              accent="#DC2626"
              icon={AlertCircle}
            >
              <MonthCompare
                thisLabel="This month outstanding"
                thisValue={t?.outstandingThisMonth ?? 0}
                prevValue={t?.outstandingPrevMonths ?? 0}
                prevLabel="All time outstanding"
                thisClass="text-red-600"
                prevClass="text-red-800"
              />
            </KpiCard>
            <KpiCard
              title="Collection Rate"
              value={loading && !data ? "…" : `${t?.collectionRate ?? 0}%`}
              hint={`of total quoted`}
              accent="#0EA5E9"
              icon={Percent}
            >
              <div className="mt-3 w-full h-2 rounded-full bg-crm-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${Math.min(100, t?.collectionRate ?? 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-crm-text-muted mt-1.5 tabular-nums">
                {formatMoneyAlways(t?.collectedAmount ?? 0)} of {formatMoneyAlways(t?.quotedAmount ?? 0)} quoted
              </p>
            </KpiCard>
          </section>

          {/* Charts row */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Payment status donut */}
            <div className={`${BENTO} p-4 sm:p-5`}>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-crm-text-muted mb-3">
                Payment Status
              </h2>
              {statusPie.length === 0 ? (
                <p className="text-sm text-crm-text-faint text-center py-12">No status data</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <RechartsBox height={180} className="w-full sm:w-[180px] shrink-0">
                    <PieChart>
                      <Pie
                        data={statusPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={2}
                      >
                        {statusPie.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [String(value ?? 0), "Projects"]}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--crm-border)",
                          background: "var(--crm-surface)",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </RechartsBox>
                  <ul className="space-y-2 w-full">
                    {[
                      { label: "Paid", value: status?.paid ?? 0, color: STATUS_COLORS.paid },
                      { label: "Partial", value: status?.partial ?? 0, color: STATUS_COLORS.partial },
                      { label: "Unpaid", value: status?.unpaid ?? 0, color: STATUS_COLORS.unpaid },
                    ].map((row) => (
                      <li key={row.label} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-crm-text-secondary font-medium">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: row.color }} />
                          {row.label}
                        </span>
                        <span className="font-bold text-crm-text tabular-nums">{row.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Sources bar chart */}
            <div className={`${BENTO} p-4 sm:p-5 lg:col-span-2`}>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-crm-text-muted mb-1">
                Collected by Source
              </h2>
              <p className="text-[11px] text-crm-text-faint mb-3">
                Ahmed Hamza · Sharjeel Nasir · Cheque · Habib Metro
              </p>
              <RechartsBox height={200}>
                <BarChart data={sourceBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-border-subtle)" vertical={false} />
                  <XAxis
                    dataKey="short"
                    tick={{ fontSize: 11, fill: "var(--crm-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--crm-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value) => [formatMoneyAlways(Number(value ?? 0)), "Collected"]}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { name?: string } | undefined;
                      return row?.name ?? "";
                    }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--crm-border)",
                      background: "var(--crm-surface)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="amount" radius={[8, 8, 0, 0]} maxBarSize={48}>
                    {sourceBars.map((s) => (
                      <Cell key={s.key} fill={s.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </RechartsBox>
            </div>
          </section>

          {/* Source cards — one card per channel; USD / CAD / PKR always separate */}
          <section>
            <h2 className="text-sm font-bold text-crm-text mb-1">
              Sources · {data?.monthLabel ?? "All time"}
            </h2>
            <p className="text-[11px] text-crm-text-muted mb-3">
              Same source can collect USD, CAD and PKR — amounts stay separate in one card
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {channels.map((ch) => {
                const style = CHANNEL_STYLES[ch.key];
                const active = CURRENCY_ORDER.filter((c) => (ch.totals[c] ?? 0) > 0);
                const primary =
                  active.length === 1
                    ? formatMoneyAlways(ch.totals[active[0]!], active[0])
                    : active.length > 1
                      ? `${active.length} currencies`
                      : formatMoneyAlways(0);

                return (
                  <div
                    key={ch.key}
                    className={`${BENTO} relative overflow-hidden p-4 pl-5`}
                  >
                    <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full" style={{ background: style.color }} />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: style.color }} />
                          <span className="text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
                            {ch.key}
                          </span>
                        </div>
                        <h3 className="font-bold text-crm-text text-sm mt-1">{ch.label}</h3>
                      </div>
                      <span className="text-[11px] font-bold bg-crm-surface border border-crm-border-subtle px-2 py-0.5 rounded-lg text-crm-text-muted">
                        {ch.paymentCount} paid
                      </span>
                    </div>
                    <p className="text-xl font-extrabold text-crm-text tabular-nums mt-3 tracking-tight">
                      {primary}
                    </p>
                    <p className="text-[11px] text-crm-text-faint mt-0.5">
                      {ch.projectCount} project{ch.projectCount === 1 ? "" : "s"}
                      {active.length > 0 ? ` · ${active.join(" + ")}` : " · No currency yet"}
                    </p>
                    <CurrencyBreakdown totals={ch.totals} accent={style.color} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* Project lists — collected (full+partial) + unpaid */}
          <div className="space-y-4">
            <ProjectList
              key={`collected-${data?.month ?? "all"}-${dateFrom}-${dateTo}`}
              title="Collected"
              subtitle={
                dateRangeActive
                  ? `Projects with a payment date ${paymentDateLabel} — expand a row to see matching payments`
                  : "Paid amount — full paid projects and the collected portion of partial pays"
              }
              rows={collectedRows}
              tone="emerald"
              emptyText={
                dateRangeActive
                  ? "No projects with a payment date in this range."
                  : "No collected projects in this period."
              }
              perRowStatus
              onView={(leadId) => void openProjectEdit(leadId)}
              viewingLeadId={viewingLeadId}
            />
            <ProjectList
              key={`unpaid-${data?.month ?? "all"}-${dateFrom}-${dateTo}`}
              title="Unpaid (with quote)"
              subtitle={
                dateRangeActive
                  ? `Partial remaining that also has a payment date ${paymentDateLabel}`
                  : month
                    ? "This month’s unpaid invoices plus all-time outstanding"
                    : "Fully unpaid quotes plus remaining balance on partial pays"
              }
              rows={unpaidRows}
              tone="red"
              emptyText={
                dateRangeActive
                  ? "No unpaid / remaining rows with a payment date in this range."
                  : "No unpaid quoted projects."
              }
              canDiscard={canDiscard}
              onDiscard={(leadId, discarded) => void handleDiscard(leadId, discarded)}
              onView={(leadId) => void openProjectEdit(leadId)}
              viewingLeadId={viewingLeadId}
            />
          </div>
        </div>
      </main>
      <ProjectWorkbenchModal
        open={!!workbench}
        onClose={() => setWorkbench(null)}
        initial={workbench ?? emptyWorkbench()}
        mode="admin"
        initialSection="payment"
        csrs={csrs}
        saving={workbenchSaving}
        onSave={saveWorkbench}
      />
    </div>
  );
}
