"use client";

import PaymentStatusCircle from "@/app/csr/components/shared/PaymentStatusCircle";
import { useState, type ReactNode } from "react";
import {
  formatPaymentMoney,
  formatPaymentWhen,
  formatQuotedAmount,
  latestPaidPayment,
  parseMoney,
  parsePayments,
  paymentActivityAt,
  paymentChannelLabel,
  paymentPercent,
  paymentTypeDisplay,
  sortPaymentsNewestFirst,
  getProjectWorkStatus,
  PROJECT_WORK_STATUS_OPTIONS,
  normalizeDeadlineTiming,
  formatDateDayMonthYear,
  type ProjectWorkStatus,
  ProjectPayment,
} from "@/lib/projectFields";
import { getTechnicalWorkflowStatus } from "@/lib/technicalAssignments";
import {
  parseTechnicalAssignments,
  isAssignmentWorking,
  isAssignmentTakeoffReady,
  isAssignmentPricingSent,
  type TechnicalAssignment,
} from "@/lib/technicalAssignments";
import { User2, Briefcase, Building2, Phone, Mail, Calendar } from "lucide-react";
import { useFixedPopover } from "@/app/csr/hooks/useFixedPopover";
import { createPortal } from "react-dom";
import EmailWithExtraCell from "@/app/csr/components/shared/EmailWithExtraCell";

export type ProjectTableRow = {
  id: string;
  name: string | null;
  company?: string | null;
  ownerName?: string | null;
  phone: string | null;
  email: string | null;
  projectCode?: string | null;
  clientCode?: string | null;
  projectTitle: string | null;
  projectScope?: string | null;
  interestedService: string | null;
  projectBudget: string | null;
  projectDeadline: string | null;
  deadlineTiming?: string | null;
  projectPhase?: string | null;
  projectPayments?: ProjectPayment[] | string | null;
  state?: string | null;
  timezone?: string | null;
  /** When the project was added to Project DB */
  createdAt?: string | null;
};

function cleanVal(v?: string | null): string | null {
  const s = v?.trim();
  if (!s || s === "N/A" || s === "—") return null;
  return s;
}

function DetailLine({
  icon,
  children,
  className = "text-gray-600",
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[10px] xl:text-[11px] truncate flex items-center gap-1 min-w-0 ${className}`}>
      {icon}
      <span className="truncate">{children}</span>
    </p>
  );
}

function formatAddedDate(iso?: string | null): string | null {
  if (!iso) return null;
  const formatted = formatDateDayMonthYear(iso);
  return formatted || null;
}

export function ClientDetailCell({ p }: { p: ProjectTableRow }) {
  const company = cleanVal(p.company);
  const client = cleanVal(p.name);
  const phone = cleanVal(p.phone);
  const email = cleanVal(p.email);
  const addedOn = formatAddedDate(p.createdAt);
  const initial = (company || client || "?").charAt(0).toUpperCase();

  if (!company && !client && !phone && !email && !addedOn) {
    return <span className="text-[10px] text-gray-400">—</span>;
  }

  return (
    <div className="min-w-0 flex items-start gap-2">
      <span className="mt-0.5 w-8 h-8 rounded-xl bg-[#1B6FE8] text-white text-[11px] font-extrabold inline-flex items-center justify-center shrink-0">
        {initial}
      </span>
      <div className="min-w-0 space-y-0.5">
        {company && (
          <DetailLine icon={<Building2 size={9} className="text-[#1B6FE8] shrink-0" />} className="font-bold text-[#0F172A]">
            {company}
          </DetailLine>
        )}
        {client && (
          <DetailLine icon={<User2 size={9} className="text-slate-400 shrink-0" />} className="font-medium text-slate-700">
            {client}
          </DetailLine>
        )}
        {phone && (
          <DetailLine icon={<Phone size={9} className="text-slate-400 shrink-0" />}>
            {phone}
          </DetailLine>
        )}
        {email && (
          <div className="text-[10px] xl:text-[11px] truncate flex items-center gap-1 min-w-0 text-slate-500">
            <Mail size={9} className="text-slate-400 shrink-0" />
            <EmailWithExtraCell
              email={email}
              clientName={client || undefined}
              company={company || undefined}
              className="text-[10px] xl:text-[11px] text-[#0B84F3]"
            />
          </div>
        )}
        {addedOn && (
          <DetailLine icon={<Calendar size={9} className="text-[#1B6FE8] shrink-0" />} className="text-slate-500">
            Added {addedOn}
          </DetailLine>
        )}
      </div>
    </div>
  );
}

function ProjectMetaLine({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <p className="flex items-baseline gap-1.5 min-w-0 text-[11px] leading-snug">
      <span className="shrink-0 text-[10px] font-semibold text-slate-400 w-[52px]">{label}</span>
      <span className={`truncate font-bold ${accent ? "text-[#1B6FE8]" : "text-[#0F172A] dark:text-crm-text"}`}>
        {value}
      </span>
    </p>
  );
}

export function ProjectDetailCell({ p }: { p: ProjectTableRow }) {
  const code = cleanVal(p.projectCode) || cleanVal(p.clientCode);
  const title = cleanVal(p.projectTitle);
  const scope = cleanVal(p.projectScope);
  const state = cleanVal(p.state);
  const division = cleanVal(p.interestedService);

  return (
    <div className="min-w-0 rounded-xl bg-slate-50 dark:bg-crm-muted border border-slate-100 dark:border-crm-border-subtle px-2 py-1.5 space-y-0.5">
      {title && (
        <p className="text-xs font-extrabold text-[#0F172A] dark:text-crm-text truncate flex items-center gap-1.5">
          <Briefcase size={11} className="text-[#1B6FE8] shrink-0" />
          {title}
        </p>
      )}
      {code && <ProjectMetaLine label="Code" value={code} accent />}
      {scope && <ProjectMetaLine label="Scope" value={scope} />}
      {division && <ProjectMetaLine label="Division" value={division} />}
      {state && <ProjectMetaLine label="State" value={state} />}
      {!code && !title && !state && !scope && !division && (
        <span className="text-[10px] text-gray-400">—</span>
      )}
    </div>
  );
}

export function QuotedAmountCell({ p }: { p: ProjectTableRow }) {
  const amount = parseMoney(p.projectBudget);
  return (
    <div className="min-w-0">
      {amount > 0 ? (
        <span className="inline-flex items-center bg-[#EAF2FE] text-[#1B6FE8] text-xs font-extrabold tabular-nums px-2.5 py-1 rounded-lg border border-[#f5c5ce] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          {formatQuotedAmount(p.projectBudget)}
        </span>
      ) : (
        <span className="text-[10px] text-gray-400">Not set</span>
      )}
    </div>
  );
}

export function PaymentDetailCell({ p }: { p: ProjectTableRow }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const payments = parsePayments(p.projectPayments);
  const paidSorted = sortPaymentsNewestFirst(payments.filter((x) => x.isPaid && parseMoney(x.amount) > 0));
  const latest = paidSorted[0] ?? latestPaidPayment(payments);
  const older = paidSorted.slice(1);
  const historyAll = paidSorted;
  const pct = paymentPercent(payments, p.projectBudget);
  const paidNum = payments.length > 0
    ? payments.filter((x) => x.isPaid).reduce((s, x) => s + parseMoney(x.amount), 0)
    : 0;

  const renderPayRow = (pay: ProjectPayment, emphasize = false) => {
    const href = pay.link?.trim();
    const linkOk = !!href && (/^https?:\/\//i.test(href) || href.startsWith("/"));
    return (
      <li key={pay.id} className={`px-2.5 py-2 ${emphasize ? "" : ""}`}>
        <p className="text-[10px] font-bold text-emerald-800">
          {formatPaymentMoney(pay.amount, pay.currency)} · {paymentTypeDisplay(pay.type, payments, p.projectBudget)}
        </p>
        <p className="text-[9px] text-gray-600">
          {paymentChannelLabel(pay.paymentChannel)}
          {pay.currency ? ` · ${pay.currency}` : ""}
          {" · "}
          {formatPaymentWhen(paymentActivityAt(pay))}
        </p>
        {href ? (
          linkOk ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] font-semibold text-[#0B84F3] hover:underline break-all"
            >
              {href}
            </a>
          ) : (
            <p className="text-[9px] text-gray-500 break-all">{href}</p>
          )
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex items-start gap-2 min-w-0">
      <PaymentStatusCircle percent={pct} size={36} strokeWidth={3} />
      <div className="min-w-0 flex-1">
        {latest ? (
          <>
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] xl:text-xs font-semibold text-[#065F46]">
                  {formatPaymentMoney(latest.amount, latest.currency)} ·{" "}
                  {paymentTypeDisplay(latest.type, payments, p.projectBudget)}
                </p>
                <p className="text-[9px] text-gray-500 truncate">
                  {paymentChannelLabel(latest.paymentChannel)}
                  {latest.currency ? ` · ${latest.currency}` : ""}
                  {" · "}
                  {formatPaymentWhen(paymentActivityAt(latest))}
                </p>
              </div>
              {historyAll.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryOpen((v) => !v);
                  }}
                  className="shrink-0 mt-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md transition-colors"
                  title={historyOpen ? "Hide payment history" : `Show full payment history (${historyAll.length})`}
                  aria-expanded={historyOpen}
                >
                  +{historyAll.length - 1}
                </button>
              )}
            </div>
            {historyOpen && historyAll.length > 0 && (
              <div className="mt-1.5 rounded-lg border border-emerald-100 bg-emerald-50/70 overflow-hidden shadow-sm">
                <p className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 border-b border-emerald-100">
                  Payment history ({historyAll.length})
                </p>
                <ul className="max-h-48 overflow-y-auto divide-y divide-emerald-100/80">
                  {historyAll.map((pay) => renderPayRow(pay))}
                </ul>
              </div>
            )}
          </>
        ) : paidNum > 0 ? (
          <p className="text-[10px] text-[#065F46] font-semibold">${paidNum.toLocaleString()} received</p>
        ) : (
          <p className="text-[10px] text-gray-400">No payments yet</p>
        )}
        {parseMoney(p.projectBudget) > 0 && (
          <p className="text-[9px] text-gray-400 mt-0.5">{Math.round(pct)}% collected</p>
        )}
      </div>
    </div>
  );
}

export function FulfillmentCell({
  p,
  onTimingChange,
  hideCaption = false,
}: {
  p: ProjectTableRow;
  /** Admin quick-set: Morning / COB emergency submit signal for Technical */
  onTimingChange?: (next: "" | "morning" | "cob") => void;
  hideCaption?: boolean;
}) {
  const deadline = p.projectDeadline?.split("T")[0];
  const timing = normalizeDeadlineTiming(p.deadlineTiming);
  const deadlineLabel = deadline && deadline !== "N/A" ? formatDateDayMonthYear(deadline) : "";

  return (
    <div className="min-w-0 space-y-1.5">
      {!hideCaption && (
        <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Client Deadline</p>
      )}
      {deadlineLabel ? (
        <p className="text-[11px] xl:text-xs text-[#0F172A] font-extrabold tabular-nums flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] inline-flex items-center justify-center shrink-0">
            <Calendar size={12} />
          </span>
          {deadlineLabel}
        </p>
      ) : (
        <span className="text-[10px] text-gray-400">—</span>
      )}

      {onTimingChange ? (
        <div className="flex flex-wrap gap-1">
          {(
            [
              { value: "morning" as const, label: "Morning" },
              { value: "cob" as const, label: "COB" },
            ]
          ).map((opt) => {
            const active = timing === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onTimingChange(active ? "" : opt.value)}
                className={`h-6 px-1.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide border transition-colors ${
                  active
                    ? opt.value === "morning"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                title={
                  active
                    ? "Click again to clear"
                    : opt.value === "morning"
                      ? "Emergency — submit by morning"
                      : "Emergency — submit by COB"
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : (
        <DeadlineTimingBadge timing={timing} />
      )}
    </div>
  );
}

export const PROJECT_TABLE_HEAD =
  "text-[10px] xl:text-[11px] font-semibold uppercase tracking-wider text-crm-text-faint [.crm-thead_&]:text-white/80 [.crm-grid-head_&]:text-white/80";

export const PROJECT_TABLE_CARD =
  "crm-table-card rounded-2xl sm:rounded-[28px] border border-slate-200/80 shadow-[0_12px_40px_rgba(15,23,42,0.06)] overflow-hidden";

export const PROJECT_DB_THEAD =
  "sticky top-0 z-20 bg-[#1B6FE8]";

export const PROJECT_DB_TH =
  "px-1.5 py-2 text-left text-[9px] font-bold text-white/85 uppercase tracking-wide leading-tight overflow-hidden";

export const PROJECT_DB_TD =
  "px-2 py-2.5 align-top min-w-0 overflow-hidden";

export const PROJECT_DB_ROW =
  "group border-b border-slate-100/90 last:border-0 even:bg-slate-50/50 hover:bg-[#F8FBFF] dark:even:bg-white/[0.02] dark:hover:bg-white/[0.04] hover:shadow-[inset_3px_0_0_#1B6FE8] transition-colors align-top";

export function DeadlineTimingBadge({ timing }: { timing?: string | null }) {
  const t = normalizeDeadlineTiming(timing);
  if (!t) return null;
  const isMorning = t === "morning";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide ${
        isMorning
          ? "bg-amber-100 text-amber-800 border border-amber-200"
          : "bg-[#EAF2FE] text-[#1B6FE8] border border-[#FECACA]"
      }`}
      title={isMorning ? "Submit by morning" : "Submit by close of business"}
    >
      {isMorning ? "Morning" : "COB"}
    </span>
  );
}

export function ProjectWorkStatusBadge({
  status,
  projectDeadline,
  projectWorkStatus,
  editable = false,
  saving = false,
  onChange,
}: {
  status?: string | null;
  projectDeadline?: string | null;
  projectWorkStatus?: string | null;
  editable?: boolean;
  saving?: boolean;
  onChange?: (next: ProjectWorkStatus) => void;
}) {
  const { key, label } = getProjectWorkStatus({ status, projectDeadline, projectWorkStatus });
  const styles =
    key === "completed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : key === "in_progress"
        ? "bg-sky-50 text-sky-700 border-sky-200"
        : "bg-amber-50 text-amber-800 border-amber-200";

  if (editable && onChange) {
    return (
      <select
        value={key}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as ProjectWorkStatus)}
        className={`h-8 max-w-full rounded-lg border px-2 text-[10px] xl:text-[11px] font-bold outline-none cursor-pointer disabled:opacity-60 ${styles}`}
        title="Change project status"
      >
        {PROJECT_WORK_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] xl:text-[11px] font-bold border whitespace-nowrap ${styles}`}
    >
      {label}
    </span>
  );
}

const WORKFLOW_STATUS_STYLES: Record<string, string> = {
  not_assigned: "bg-slate-50 text-slate-700 border-slate-200",
  assigned: "bg-sky-50 text-sky-700 border-sky-200",
  takeoff_done: "bg-violet-50 text-violet-700 border-violet-200",
  pricing: "bg-amber-50 text-amber-800 border-amber-200",
  final_submission: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  not_completed: "bg-amber-50 text-amber-800 border-amber-200",
};

function assignmentStage(a: TechnicalAssignment): { label: string; className: string } {
  if (isAssignmentPricingSent(a)) {
    return { label: "Pricing", className: "bg-amber-100 text-amber-800" };
  }
  if (isAssignmentTakeoffReady(a)) {
    return { label: "Take Off Done", className: "bg-violet-100 text-violet-800" };
  }
  if (isAssignmentWorking(a)) {
    return { label: "Pending", className: "bg-sky-100 text-sky-800" };
  }
  return { label: "—", className: "bg-gray-100 text-gray-600" };
}

/** Read-only status synced with Technical workflow tabs. */
export function TechnicalWorkflowStatusBadge({
  status,
  projectDeadline,
  projectWorkStatus,
  projectPhase,
  technicalAssignments,
}: {
  status?: string | null;
  projectDeadline?: string | null;
  projectWorkStatus?: string | null;
  projectPhase?: string | null;
  technicalAssignments?: unknown;
}) {
  const { key, label } = getTechnicalWorkflowStatus({
    status,
    projectDeadline,
    projectWorkStatus,
    projectPhase,
    technicalAssignments,
  });
  const styles = WORKFLOW_STATUS_STYLES[key] ?? WORKFLOW_STATUS_STYLES.in_progress;
  const list = parseTechnicalAssignments(technicalAssignments);
  const panelW = 280;
  const { open, toggle, anchorRef, panelRef, style } = useFixedPopover(panelW, 320, "end");

  const popup =
    open &&
    list.length > 0 &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-80 overflow-y-auto z-[80]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1.5 border-b border-gray-100 sticky top-0 bg-white">
          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">
            Who is where ({list.length})
          </span>
        </div>
        {list.map((a) => {
          const stage = assignmentStage(a);
          return (
            <div
              key={a.estimatorId}
              className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-gray-50 last:border-0 min-w-0"
            >
              <div className="min-w-0 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#1B6FE8] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  {a.estimatorName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#0F172A] truncate">{a.estimatorName}</p>
                  <p className="text-[9px] text-gray-500 truncate">
                    {(a.scopes ?? []).filter(Boolean).join(", ") || "—"}
                    {a.divisions?.length
                      ? ` · ${a.divisions.filter(Boolean).join(", ")}`
                      : ""}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-extrabold ${stage.className}`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>,
      document.body,
    );

  if (list.length === 0) {
    return (
      <span
        className={`inline-flex items-center max-w-full px-2 py-1 rounded-lg text-[10px] xl:text-[11px] font-bold border truncate ${styles}`}
        title={label}
      >
        {label}
      </span>
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={`inline-flex items-center gap-1 max-w-full px-2 py-1 rounded-lg text-[10px] xl:text-[11px] font-bold border text-left hover:opacity-90 ${styles}`}
        title="Click to see who is Pricing / Pending / Take Off Done"
      >
        <span className="truncate min-w-0">{label}</span>
        <span className="shrink-0 text-[9px] opacity-70">▾</span>
      </button>
      {popup}
    </div>
  );
}
