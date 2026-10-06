"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, ChevronDown, User2, Briefcase, DollarSign,
  Plus, Trash2, Save, Loader2, Link2, StickyNote, Hash, Calendar,
} from "lucide-react";
import ServicePicker from "@/app/csr/components/shared/ServicePicker";
import CommentCell from "@/app/csr/components/shared/CommentCell";
import { ReqLabel } from "@/app/components/form/RequiredMark";
import { NoteEntry } from "@/app/csr/hooks/useLeadsData";
import { peekAuthMe } from "@/lib/authMeCache";
import {
  PAYMENT_TYPE_OPTIONS,
  PAYMENT_CHANNEL_OPTIONS,
  PAYMENT_CURRENCY_OPTIONS,
  ProjectPayment,
  ProjectWorkbenchData,
  CSR_ASSIGN_OTHER,
  newPaymentId,
  paidTotal,
  paymentPercent,
  parseMoney,
  stripBudgetForInput,
  paymentCalendarDay,
  paymentCalendarMonth,
  formatPaymentDateOnly,
  formatDateDayMonthYear,
} from "@/lib/projectFields";
import PaymentStatusCircle from "@/app/csr/components/shared/PaymentStatusCircle";
import { useClientPhoneLookup, type ClientLookupData } from "@/app/csr/hooks/useClientPhoneLookup";
import toast from "react-hot-toast";

type CSROption = { id: string; name: string; csrCode?: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  initial: ProjectWorkbenchData;
  mode: "admin" | "csr";
  createMode?: boolean;
  /** When set, project code is auto-allocated as `{clientCode}-N` on save */
  sourceClientId?: string;
  csrs?: CSROption[];
  saving?: boolean;
  onSave: (data: ProjectWorkbenchData) => Promise<void>;
  onDelete?: () => Promise<void>;
  noteHistory?: NoteEntry[];
  onAddNote?: (text: string, parentId?: string) => Promise<void>;
  onNoteUpdated?: (noteId: string, text: string, createdAt?: string) => void;
  onNoteDeleted?: (noteId: string) => void;
  /** Admin↔TM thread — Notes for Technical / Notes for Sir */
  technicalNoteHistory?: NoteEntry[];
  onAddTechnicalNote?: (text: string) => Promise<unknown>;
  /** Technical portal — hide Client / Quoted / Payment / CSR sections */
  hideClientFinanceSections?: boolean;
  /** Accordion to open first (e.g. "payment" from Admin Payments). */
  initialSection?: string;
};

const inputCls =
  "w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input px-3 sm:px-4 text-sm text-crm-text outline-none focus:border-[#1B6FE8] focus:bg-white dark:focus:bg-crm-surface transition-colors";
const labelCls =
  "text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-crm-text-muted uppercase tracking-wider mb-1.5 sm:mb-2 block";

function Section({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl overflow-hidden border-2 transition-all ${
      open ? "border-[#1B6FE8]/30 shadow-sm shadow-[#1B6FE8]/5" : "border-gray-100 dark:border-crm-border-subtle"
    }`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${
          open
            ? "bg-gradient-to-r from-[#EAF2FE] to-white dark:from-crm-muted dark:to-crm-surface-raised"
            : "bg-[#FAFAFA] hover:bg-gray-50 dark:bg-crm-muted dark:hover:bg-crm-surface-raised"
        }`}
      >
        <span className="flex items-center gap-2.5 text-sm font-bold text-[#0F172A] dark:text-crm-text">
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            open ? "bg-[#1B6FE8] text-white" : "bg-[#EAF2FE] text-[#1B6FE8] dark:bg-crm-surface-raised"
          }`}>
            <Icon size={15} />
          </span>
          {title}
        </span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180 text-[#1B6FE8]" : "text-gray-400 dark:text-crm-text-muted"}`} />
      </button>
      {open && <div className="p-4 sm:p-5 space-y-3 border-t border-[#1B6FE8]/10 dark:border-crm-border-subtle bg-white dark:bg-crm-surface">{children}</div>}
    </div>
  );
}

export default function ProjectWorkbenchModal({
  open,
  onClose,
  initial,
  mode,
  createMode = false,
  sourceClientId,
  csrs = [],
  saving = false,
  onSave,
  onDelete,
  noteHistory,
  onAddNote,
  onNoteUpdated,
  onNoteDeleted,
  technicalNoteHistory,
  onAddTechnicalNote,
  hideClientFinanceSections = false,
  initialSection,
}: Props) {
  const startSection = initialSection || (hideClientFinanceSections ? "project" : "client");
  const [data, setData] = useState<ProjectWorkbenchData>(initial);
  const [openSection, setOpenSection] = useState<string>(startSection);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wasOpenRef = useRef(false);
  const loadedIdRef = useRef<string>("");

  const applyPhoneClient = useCallback((client: ClientLookupData) => {
    setData((d) => ({
      ...d,
      name: client.name || d.name,
      company: client.company || d.company,
      email: client.email || d.email,
      ownerName: client.ownerName || d.ownerName,
      state: client.state || d.state,
      interestedService: d.interestedService || client.interestedService || "",
    }));
  }, []);
  const {
    phoneLookupLoading,
    returningClient,
    resetLookup,
    onPhoneValueChange,
    onPhoneBlur,
    onPhonePaste,
  } = useClientPhoneLookup(
    applyPhoneClient,
    mode === "admin" ? "/admin/lookup-by-phone" : "/csr/lookup-by-phone",
  );

  // Only reset accordion / form when modal opens or a different project is loaded —
  // not on every parent re-render (parent rebuilds `initial` each time).
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      loadedIdRef.current = "";
      return;
    }
    const justOpened = !wasOpenRef.current;
    const projectChanged = initial.id !== loadedIdRef.current;
    wasOpenRef.current = true;
    if (justOpened || projectChanged) {
      setData(initial);
      if (createMode) resetLookup();
      setOpenSection(initialSection || (hideClientFinanceSections ? "project" : "client"));
      setConfirmDelete(false);
      loadedIdRef.current = initial.id;
    }
  }, [open, initial, hideClientFinanceSections, initialSection, createMode, resetLookup]);

  if (!open) return null;

  const budgetNum = parseMoney(data.projectBudget);
  const paidNum = paidTotal(data.projectPayments);
  const pct = paymentPercent(data.projectPayments, data.projectBudget);
  const remaining = Math.max(0, budgetNum - paidNum);
  const quoteLocked = mode !== "admin" && !createMode && parseMoney(initial.projectBudget) > 0;
  const quotedOn = (() => {
    const iso = data.projectCreatedAt || initial.projectCreatedAt;
    if (!iso) return "";
    return formatDateDayMonthYear(iso);
  })();

  const addPayment = () => {
    const now = new Date().toISOString();
    setData((d) => ({
      ...d,
      projectPayments: [
        ...d.projectPayments,
        {
          id: newPaymentId(),
          type: "Partial",
          amount: "",
          link: "",
          isPaid: false,
          createdAt: now,
          paymentChannel: undefined,
          currency: undefined,
        },
      ],
    }));
  };

  const updatePayment = (id: string, patch: Partial<ProjectPayment>) => {
    setData((d) => {
      const projectPayments = d.projectPayments.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (!next.createdAt) next.createdAt = new Date().toISOString();
        if (patch.paidAt !== undefined) {
          const day = paymentCalendarDay(next.paidAt);
          if (day) {
            next.paidAt = day;
            next.accountsMonth = day.slice(0, 7);
          } else {
            next.paidAt = undefined;
            next.accountsMonth = undefined;
          }
        } else if (next.paidAt) {
          const day = paymentCalendarDay(next.paidAt);
          if (day) next.accountsMonth = paymentCalendarMonth(day);
        }
        if (patch.isPaid === false) {
          next.paidAt = undefined;
          next.accountsMonth = undefined;
        }
        return next;
      });
      // Auto Full when quote fully collected
      if (paymentPercent(projectPayments, d.projectBudget) >= 100) {
        return {
          ...d,
          projectPayments: projectPayments.map((p) =>
            p.isPaid && parseMoney(p.amount) > 0 ? { ...p, type: "Full" } : p,
          ),
        };
      }
      return { ...d, projectPayments };
    });
  };

  const removePayment = (id: string) => {
    setData((d) => ({ ...d, projectPayments: d.projectPayments.filter((p) => p.id !== id) }));
  };

  const toggleSection = (key: string) => {
    setOpenSection((s) => {
      const next = s === key ? "" : key;
      // Opening Payment Detail with no rows — seed one entry so channel/currency/month are visible
      if (next === "payment" && mode !== "csr" && !hideClientFinanceSections) {
        setData((d) => {
          if (d.projectPayments.length > 0) return d;
          return {
            ...d,
            projectPayments: [
              {
                id: newPaymentId(),
                type: "Partial",
                amount: "",
                link: "",
                isPaid: false,
                createdAt: new Date().toISOString(),
                paymentChannel: undefined,
                currency: undefined,
              },
            ],
          };
        });
      }
      return next;
    });
  };

  const validateAndSave = async () => {
    const req = (v: string | undefined | null) => !!v?.trim();
    if (!hideClientFinanceSections) {
      if (!req(data.name)) { toast.error("Client name is required"); return; }
      if (!req(data.company)) { toast.error("Company name is required"); return; }
      if (!req(data.phone)) { toast.error("Phone is required"); return; }
      if (!req(data.email)) { toast.error("Email is required"); return; }
      if (mode === "admin" && data.assignedTo === CSR_ASSIGN_OTHER && !req(data.projectSource)) {
        toast.error("Resource name is required");
        return;
      }
    }
    if (!sourceClientId && !req(data.projectCode)) { toast.error("Project code is required"); return; }
    if (!req(data.projectTitle)) { toast.error("Project title is required"); return; }
    if (!req(data.interestedService)) { toast.error("Service is required"); return; }
    if (!req(data.state)) { toast.error("State is required"); return; }
    if (!req(data.projectScope)) { toast.error("Scope is required"); return; }
    if (!req(data.projectDeadline)) { toast.error("Project deadline is required"); return; }
    if (!hideClientFinanceSections && !req(data.projectBudget)) {
      toast.error("Quotation / budget is required");
      return;
    }
    if (createMode && !req(data.projectNotes)) {
        toast.error("Bid Instruction notes are required");
        return;
      }
    if (mode === "admin" && !hideClientFinanceSections) {
      const missingDate = data.projectPayments.find(
        (p) => (p.isPaid || !!p.link?.trim()) && !(p.paidAt || p.accountsMonth),
      );
      if (missingDate) {
        toast.error("Set the payment date next to the link so it posts in the right month");
        return;
      }
      const badPaid = data.projectPayments.find(
        (p) =>
          p.isPaid &&
          (!p.paymentChannel || !p.currency || !(p.paidAt || p.accountsMonth) || !parseMoney(p.amount)),
      );
      if (badPaid) {
        toast.error("Paid entries need amount, channel, USD/CAD/PKR, and payment date");
        return;
      }
    }
    // Ensure 100% → Full type before save
    const toSave =
      paymentPercent(data.projectPayments, data.projectBudget) >= 100
        ? {
            ...data,
            projectPayments: data.projectPayments.map((p) =>
              p.isPaid && parseMoney(p.amount) > 0 ? { ...p, type: "Full" } : p,
            ),
          }
        : data;
    await onSave(toSave);
  };

  return (
    <div className="fixed inset-0 z-[140] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-crm-surface w-full sm:max-w-2xl rounded-t-[24px] sm:rounded-[28px] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-6 pt-5 pb-5 shrink-0 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white z-10"
          >
            <X size={15} />
          </button>
          <div className="flex items-center gap-3 pr-10">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {(data.projectTitle || data.projectCode || "P").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {createMode ? "Add New Project" : (data.projectTitle || data.projectCode || (hideClientFinanceSections ? "Project" : data.name) || "Project")}
              </h2>
              <p className="text-white/70 text-xs mt-0.5 truncate">
                {createMode
                  ? hideClientFinanceSections
                    ? "Fill in project details"
                    : "Fill in client, project & payment details"
                  : hideClientFinanceSections
                    ? (data.projectCode ? `Code · ${data.projectCode}` : "Project details")
                    : `${data.name}${data.projectCode ? ` · ${data.projectCode}` : ""}`}
              </p>
            </div>
          </div>
          {data.projectCode && (
            <span className="inline-flex items-center gap-1 mt-3 bg-white/20 text-white px-2.5 py-1 rounded-full text-[11px] font-semibold">
              <Hash size={10} /> {data.projectCode}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3 bg-[#F5F6FA] dark:bg-crm-bg-subtle">
          {!hideClientFinanceSections && (
          <Section
            title="Client Detail"
            icon={User2}
            open={openSection === "client"}
            onToggle={() => toggleSection("client")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <ReqLabel required>Client Name</ReqLabel>
                <input className={inputCls} value={data.name}
                  onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <ReqLabel required>Company Name</ReqLabel>
                <input className={inputCls} value={data.company} placeholder="Company name"
                  onChange={(e) => setData((d) => ({ ...d, company: e.target.value }))} />
              </div>
              <div>
                <ReqLabel>Owner Name</ReqLabel>
                <input className={inputCls} value={data.ownerName} placeholder="Optional"
                  onChange={(e) => setData((d) => ({ ...d, ownerName: e.target.value }))} />
              </div>
              <div>
                <ReqLabel required>
                  Phone
                  {createMode && (
                    <span className="text-gray-300 normal-case font-normal"> (paste to auto-fill)</span>
                  )}
                </ReqLabel>
                <div className="relative">
                  <input
                    className={inputCls}
                    value={data.phone}
                    onChange={(e) => {
                      const value = e.target.value;
                      setData((d) => ({ ...d, phone: value }));
                      if (createMode) onPhoneValueChange(value);
                    }}
                    onBlur={(e) => { if (createMode) onPhoneBlur(e.target.value); }}
                    onPaste={createMode ? onPhonePaste : undefined}
                  />
                  {createMode && phoneLookupLoading && (
                    <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1B6FE8] animate-spin" />
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <ReqLabel required>Email</ReqLabel>
                <input className={inputCls} type="email" value={data.email}
                  onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))} />
              </div>
              {createMode && returningClient && (
                <div className="sm:col-span-2 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-xl">
                  <User2 size={12} className="shrink-0" />
                  Returning client — details auto-filled from previous record
                </div>
              )}
              {mode === "admin" ? (
                <>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      Assigned CSR
                      {createMode && <span className="text-gray-300 normal-case font-normal"> (optional)</span>}
                    </label>
                    <select
                      className={inputCls}
                      value={data.assignedTo ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const csr = csrs.find((c) => c.id === val);
                        setData((d) => ({
                          ...d,
                          assignedTo: val,
                          csrName: csr?.name ?? d.csrName,
                          csrCode: csr?.csrCode ?? d.csrCode,
                          projectSource: val === CSR_ASSIGN_OTHER ? d.projectSource : "",
                        }));
                      }}
                    >
                      <option value="">— No CSR —</option>
                      <option value={CSR_ASSIGN_OTHER}>Other / External resource…</option>
                      {csrs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.csrCode ? `${c.csrCode} — ` : ""}{c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {data.assignedTo === CSR_ASSIGN_OTHER && (
                    <div className="sm:col-span-2">
                      <ReqLabel required>Resource name</ReqLabel>
                      <input
                        className={inputCls}
                        value={data.projectSource ?? ""}
                        placeholder="e.g. Freelancer, Partner agency…"
                        onChange={(e) => setData((d) => ({ ...d, projectSource: e.target.value }))}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="sm:col-span-2 bg-[#ECFDF5] rounded-xl px-3 py-2.5 border border-emerald-100">
                  <label className={labelCls}>CSR</label>
                  <p className="text-sm font-semibold text-[#065F46]">
                    {data.csrCode ? `${data.csrCode} · ` : ""}{data.csrName || "—"}
                  </p>
                </div>
              )}
            </div>
          </Section>
          )}

          <Section
            title="Project Detail"
            icon={Briefcase}
            open={openSection === "project"}
            onToggle={() => toggleSection("project")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <ReqLabel required={!sourceClientId && !hideClientFinanceSections}>Project Code</ReqLabel>
                <input
                  className={`${inputCls}${
                    hideClientFinanceSections || (!!sourceClientId && !data.projectCode)
                      ? " cursor-default bg-gray-100 dark:bg-crm-muted text-crm-text-secondary"
                      : ""
                  }`}
                  value={data.projectCode}
                  placeholder={sourceClientId ? "Auto: clientCode-N" : undefined}
                  readOnly={hideClientFinanceSections || (!!sourceClientId && !data.projectCode)}
                  onChange={(e) => {
                    if (hideClientFinanceSections) return;
                    setData((d) => ({ ...d, projectCode: e.target.value }));
                  }}
                />
                {hideClientFinanceSections ? (
                  <p className="text-[10px] text-gray-400 mt-1">Preview only</p>
                ) : sourceClientId && !data.projectCode ? (
                  <p className="text-[10px] text-gray-400 mt-1">Assigned automatically from client code</p>
                ) : null}
              </div>
              <div>
                <ReqLabel required>Project Title</ReqLabel>
                <input className={inputCls} value={data.projectTitle}
                  onChange={(e) => setData((d) => ({ ...d, projectTitle: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <ReqLabel required>Service</ReqLabel>
                <ServicePicker
                  value={data.interestedService}
                  onChange={(v) => setData((d) => ({ ...d, interestedService: v }))}
                />
              </div>
              <div>
                <ReqLabel required>State</ReqLabel>
                <input className={inputCls} value={data.state}
                  onChange={(e) => setData((d) => ({ ...d, state: e.target.value }))} />
              </div>
              <div>
                <ReqLabel required>Project Deadline</ReqLabel>
                <input
                  type="date"
                  className={inputCls}
                  value={data.projectDeadline}
                  onChange={(e) => setData((d) => ({ ...d, projectDeadline: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    Emergency submit
                  </span>
                  {(
                    [
                      { value: "morning", label: "Morning" },
                      { value: "cob", label: "COB" },
                    ] as const
                  ).map((opt) => {
                    const active = (data.deadlineTiming || "") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            deadlineTiming: active ? "" : opt.value,
                          }))
                        }
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition-colors ${
                          active
                            ? opt.value === "morning"
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="sm:col-span-2">
                <ReqLabel required>Scope</ReqLabel>
                <textarea
                  className={`${inputCls} h-20 py-2.5 resize-none`}
                  value={data.projectScope}
                  placeholder="Project scope / deliverables"
                  onChange={(e) => setData((d) => ({ ...d, projectScope: e.target.value }))}
                />
              </div>
            </div>
          </Section>

          {!hideClientFinanceSections && (
          <Section
            title="Payment Detail"
            icon={DollarSign}
            open={openSection === "payment"}
            onToggle={() => toggleSection("payment")}
          >
            <div className="bg-gradient-to-br from-[#F8F9FC] to-white rounded-2xl border border-gray-100 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex justify-center sm:justify-start shrink-0">
                  <PaymentStatusCircle percent={pct} size={56} strokeWidth={4} />
                </div>
                <div className="grid grid-cols-3 gap-2 flex-1 min-w-0">
                  <div className="bg-emerald-50 rounded-xl px-2 py-2.5 text-center border border-emerald-100">
                    <p className="text-[9px] text-emerald-600 font-medium uppercase">Paid</p>
                    <p className="text-sm font-bold text-emerald-700">${paidNum.toLocaleString()}</p>
                  </div>
                  <div className="bg-[#EAF2FE] rounded-xl px-2 py-2.5 text-center border border-[#f5c5ce]">
                    <p className="text-[9px] text-[#1B6FE8] font-medium uppercase">Quote</p>
                    <p className="text-sm font-bold text-[#1B6FE8]">${budgetNum.toLocaleString()}</p>
                    {quotedOn && (
                      <p className="text-[9px] text-[#1B6FE8]/70 mt-0.5 leading-tight">on {quotedOn}</p>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-xl px-2 py-2.5 text-center border border-gray-100">
                    <p className="text-[9px] text-gray-500 font-medium uppercase">Due</p>
                    <p className="text-sm font-bold text-gray-700">${remaining.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div>
                <ReqLabel required>Quotation / Budget ($)</ReqLabel>
                <div className="relative">
                  <span className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none z-[1]">$</span>
                  <input
                    className={`${inputCls} !pl-8 sm:!pl-9 font-semibold text-[#0F172A]${
                      quoteLocked ? " cursor-default bg-gray-100 dark:bg-crm-muted" : ""
                    }`}
                    value={stripBudgetForInput(data.projectBudget)}
                    placeholder="0.00"
                    inputMode="decimal"
                    readOnly={quoteLocked}
                    onChange={(e) => {
                      if (quoteLocked) return;
                      setData((d) => ({ ...d, projectBudget: e.target.value.replace(/[^0-9.]/g, "") }));
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {quoteLocked
                    ? `Original quote from the day this project was created${quotedOn ? ` (${quotedOn})` : ""}. Payments below do not change it.`
                    : mode === "admin"
                      ? "Quoted amount can be edited. Payment % uses this figure."
                      : "Enter the quoted amount for this project. It stays as the original quote after save."}
                </p>
              </div>
            </div>

            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-1">
              Payment entries
            </p>
            <div className="space-y-3">
              {data.projectPayments.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4 bg-[#FAFAFA] rounded-xl">
                  No payment entries yet — tap “Add payment entry” for channel, currency, link & payment date
                </p>
              )}
              {data.projectPayments.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-2xl p-3 sm:p-4 space-y-2.5 border-2 transition-colors ${
                    p.isPaid ? "border-emerald-200 bg-emerald-50/40" : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1 block">Type</span>
                      <select
                        className={inputCls}
                        value={p.type}
                        onChange={(e) => updatePayment(p.id, { type: e.target.value })}
                      >
                        {PAYMENT_TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        {p.type &&
                        !(PAYMENT_TYPE_OPTIONS as readonly string[]).includes(p.type) ? (
                          <option value={p.type}>{p.type} (legacy)</option>
                        ) : null}
                      </select>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1 block">Amount</span>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none select-none z-[1]">
                          {p.currency === "PKR" ? "Rs" : p.currency === "CAD" ? "C$" : "$"}
                        </span>
                        <input
                          className={`${inputCls} ${p.currency === "PKR" ? "!pl-9" : "!pl-7"}`}
                          placeholder="Amount"
                          value={stripBudgetForInput(p.amount)}
                          onChange={(e) => updatePayment(p.id, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1 block">Status</span>
                      <label className={`flex items-center justify-center gap-2 h-10 sm:h-11 rounded-xl border-2 text-xs font-bold cursor-pointer transition-colors ${
                        p.isPaid
                          ? "border-emerald-400 bg-emerald-100 text-emerald-700"
                          : "border-gray-200 bg-[#FAFAFA] text-gray-500"
                      }`}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={p.isPaid}
                          onChange={(e) => {
                            if (e.target.checked && !paymentCalendarDay(p.paidAt)) {
                              toast.error("Pick the payment date next to the link first");
                              return;
                            }
                            updatePayment(p.id, { isPaid: e.target.checked });
                          }}
                        />
                        {p.isPaid ? "✓ Paid" : "Unpaid"}
                      </label>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1 block opacity-0">Del</span>
                      <button
                        type="button"
                        onClick={() => removePayment(p.id)}
                        className="w-full h-10 sm:h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 border border-red-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {mode !== "csr" && (
                    <div className="rounded-xl border border-[#F3D7DC] bg-[#FFF8F9] p-2.5 space-y-2">
                      <p className="text-[10px] font-bold text-[#1B6FE8] uppercase tracking-wide">
                        Accounts · channel / currency
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Channel</span>
                          <select
                            className={inputCls}
                            value={p.paymentChannel ?? ""}
                            onChange={(e) =>
                              updatePayment(p.id, {
                                paymentChannel: (e.target.value || undefined) as ProjectPayment["paymentChannel"],
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {PAYMENT_CHANNEL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Currency</span>
                          <select
                            className={inputCls}
                            value={p.currency ?? ""}
                            onChange={(e) =>
                              updatePayment(p.id, {
                                currency: (e.target.value || undefined) as ProjectPayment["currency"],
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {PAYMENT_CURRENCY_OPTIONS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  {mode === "csr" && (p.paymentChannel || p.currency || p.accountsMonth) ? (
                    <p className="text-[10px] text-gray-500 font-medium">
                      {PAYMENT_CHANNEL_OPTIONS.find((o) => o.value === p.paymentChannel)?.label ?? "Channel"}
                      {p.currency ? ` · ${p.currency}` : ""}
                      {p.accountsMonth ? ` · ${p.accountsMonth}` : ""}
                      <span className="text-gray-400"> (Admin / Manager)</span>
                    </p>
                  ) : null}
                  {mode !== "csr" && (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(10.5rem,12rem)] gap-2">
                      <div>
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                          Payment link
                        </span>
                        <div className="flex items-center gap-2">
                          <Link2 size={14} className="text-[#1B6FE8] shrink-0" />
                          <input
                            className={inputCls}
                            placeholder="Payment slip / invoice / receipt URL"
                            value={p.link ?? ""}
                            onChange={(e) => updatePayment(p.id, { link: e.target.value })}
                            title="Admin / Manager only — attach payment slip link"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                          Payment date
                        </span>
                        <input
                          type="date"
                          className={inputCls}
                          value={paymentCalendarDay(p.paidAt)}
                          onChange={(e) => {
                            const day = e.target.value;
                            updatePayment(p.id, {
                              paidAt: day || undefined,
                              accountsMonth: day ? day.slice(0, 7) : undefined,
                              isPaid: day ? true : p.isPaid,
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {mode === "csr" && p.link?.trim() ? (
                    <p className="text-[10px] text-gray-400 font-medium truncate" title="Payment slip (Admin/Manager only)">
                      Slip on file (managed by Admin / Manager)
                    </p>
                  ) : null}
                  {p.isPaid && paymentCalendarDay(p.paidAt) && (
                    <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                      <Calendar size={10} />
                      Paid on {formatPaymentDateOnly(p.paidAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addPayment}
              className="w-full h-10 rounded-xl border-2 border-dashed border-[#1B6FE8]/30 text-[#1B6FE8] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#EAF2FE] transition-colors"
            >
              <Plus size={14} /> Add payment entry
            </button>
          </Section>
          )}

          {(createMode || noteHistory || mode === "admin") && (
            <div className="space-y-3">
              {(createMode || noteHistory) && (
                <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <StickyNote size={12} className="text-[#1B6FE8]" /> Bid Instruction
                    {createMode && <span className="text-[#1B6FE8] normal-case">*</span>}
                  </p>
                  {createMode ? (
                    <textarea
                      className={`${inputCls} h-24 py-2.5 resize-none`}
                      value={data.projectNotes ?? ""}
                      placeholder="Bid Instruction notes…"
                      onChange={(e) => setData((d) => ({ ...d, projectNotes: e.target.value }))}
                    />
                  ) : noteHistory ? (
                    <CommentCell
                      id={data.id}
                      apiRole={mode === "admin" ? "admin" : "csr"}
                      skipNotesFetch
                      currentUserId={peekAuthMe()?.id}
                      currentUserRole={peekAuthMe()?.role}
                      noteHistory={noteHistory}
                      onAddNote={
                        onAddNote
                          ? async (_id, text, parentId) => { await onAddNote(text, parentId); }
                          : undefined
                      }
                      onNoteUpdated={
                        onNoteUpdated
                          ? (_id, noteId, text, createdAt) => onNoteUpdated(noteId, text, createdAt)
                          : undefined
                      }
                      onNoteDeleted={
                        onNoteDeleted
                          ? (_id, noteId) => onNoteDeleted(noteId)
                          : undefined
                      }
                      readOnly={mode === "csr" && !onAddNote}
                    />
                  ) : null}
                </div>
              )}

              {/* Admin↔TM thread */}
              {mode === "admin" && !createMode && (
                <div className="bg-[#FFF8F0] rounded-2xl border-2 border-amber-200 p-4">
                  <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <StickyNote size={12} className="text-amber-700" />
                    {hideClientFinanceSections ? "Notes for Sir" : "Notes from TM"}
                  </p>
                  <CommentCell
                    id={data.id || "tech-thread"}
                    apiRole="admin"
                    skipNotesFetch
                    chatStyle
                    notesKind="technical"
                    currentUserId={peekAuthMe()?.id}
                    badgeLabel={hideClientFinanceSections ? "Notes for Sir" : "Notes from TM"}
                    noteHistory={technicalNoteHistory ?? []}
                    onAddNote={
                      onAddTechnicalNote
                        ? async (_id, text) => onAddTechnicalNote(text)
                        : undefined
                    }
                    readOnly={!onAddTechnicalNote}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-crm-border-subtle flex flex-col gap-2 shrink-0 bg-white dark:bg-crm-surface">
          {mode === "admin" && !createMode && onDelete && (
            confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void (async () => {
                    setDeleting(true);
                    try {
                      await onDelete();
                    } finally {
                      setDeleting(false);
                      setConfirmDelete(false);
                    }
                  })()}
                  className="flex-1 h-11 rounded-xl bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {deleting ? "Deleting…" : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 h-11 rounded-xl bg-[#F5F6FA] dark:bg-crm-muted text-gray-600 dark:text-crm-text font-semibold text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full h-10 rounded-xl border-2 border-red-200 dark:border-red-900/40 text-red-600 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <Trash2 size={15} /> Delete Project
              </button>
            )
          )}
          <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] dark:bg-crm-muted text-gray-600 dark:text-crm-text font-semibold text-sm hover:bg-gray-100 dark:hover:bg-crm-surface-raised"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void validateAndSave()}
            className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-red-200"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? (createMode ? "Adding…" : "Saving…") : (createMode ? "Add Project" : "Save Changes")}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
