"use client";

import { useState, useEffect } from "react";
import { Trash2, X, Plus, StickyNote, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { DatedNote, SubHeadEntry } from "../types";
import { currency, isInventoryAssetHead, newRowId, sumSubHeads, todayIso } from "../types";
import { computeAdminSalary, computeExecutiveSalary, computeSalary, computeTechnicalManagerSalary, emptySalaryDetail, ensureExecutiveSalaryDetail } from "../utils/payrollFormula";
import EmployeeSalaryEditor, { ensureSalaryDetail } from "./EmployeeSalaryEditor";
import { NoteComposer } from "@/lib/noteRichText";
import ExecutiveSalaryEditor from "./ExecutiveSalaryEditor";
import SalesPayrollEmployeeEditor from "./salesPayroll/SalesPayrollEmployeeEditor";
import {
  type PayrollKind,
  payrollKindForTeamTitle,
  resolvePayrollKind,
  resolveSubPayrollKind,
  ensureSalesPayrollFromSub,
  netFromSalesSub,
  tlExtraFromPeers,
  emptySalesPayrollEmployee,
  salesSubsFromPeerRows,
  isSalesTeamTitle,
} from "../utils/salesPayrollBridge";
import type { SalesPayrollData, SalesPayrollCalcOpts } from "../utils/salesPayrollFormula";
import SalarySlipDownloadButton from "./SalarySlipDownloadButton";
import type { SalarySlipCompanyKey } from "../utils/salarySlipCompanies";
import { DEFAULT_SALARY_SLIP_COMPANY } from "../utils/salarySlipCompanies";
import AmountInput from "./AmountInput";
import ProofUploadField from "./ProofUploadField";
import BemAssetInventoryEditor from "./BemAssetInventoryEditor";
import { matchInventoryCategory } from "../utils/bemAssetInventorySeed";

export type HeadDetailModel = {
  id: string;
  title: string;
  amount: number;
  filledAt?: string;
  note?: string;
  subHeads: SubHeadEntry[];
  notes: DatedNote[];
  /** Locked at open — sales vs technical payroll editor */
  payrollKind?: PayrollKind;
};

type HeadDetailModalProps = {
  open: boolean;
  title: string;
  value: HeadDetailModel | null;
  onClose: () => void;
  onSave: (next: HeadDetailModel) => void;
  onDelete: () => void;
  /** Enable per-line screenshot / payment proof upload (OPEX). */
  allowProofUpload?: boolean;
  onUploadProof?: (file: File) => Promise<{ fileUrl: string; fileName: string }>;
  /** Full payroll editor for Team Salaries people. */
  salaryMode?: boolean;
  payrollKind?: PayrollKind;
  /** All team rows (for sales assign / TL commission). */
  peerTeamRows?: HeadDetailModel[];
  /** Net profit before executive salaries — commission base for executive payroll. */
  execProfitBase?: number;
  /** Record is currently saving — per-row Save buttons show a spinner. */
  saving?: boolean;
  /** Date used for salary-slip month label. */
  recordDate?: string;
  calcOpts?: SalesPayrollCalcOpts;
  /** Company slip format (BEM Solutions now; GPS/BDS later). */
  salarySlipCompany?: SalarySlipCompanyKey;
  /** BEM Asset inventory tables (qty × unit price). */
  inventoryMode?: boolean;
  /** When false, never use qty × unit-price (Equity / Liabilities). */
  allowInventory?: boolean;
};

export default function HeadDetailModal({
  open,
  title,
  value,
  onClose,
  onSave,
  onDelete,
  allowProofUpload = false,
  onUploadProof,
  salaryMode = false,
  payrollKind: payrollKindProp,
  peerTeamRows = [],
  execProfitBase = 0,
  saving = false,
  recordDate = todayIso(),
  calcOpts: calcOptsProp,
  salarySlipCompany = DEFAULT_SALARY_SLIP_COMPANY,
  inventoryMode: inventoryModeProp = false,
  allowInventory = true,
}: HeadDetailModalProps) {
  const calcOpts = calcOptsProp ?? { recordDate };
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [openSalaryIds, setOpenSalaryIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<HeadDetailModel | null>(null);

  useEffect(() => {
    if (!open || !value) {
      setDraft(null);
      setOpenSalaryIds(new Set());
      return;
    }
    setDraft({
      ...value,
      subHeads: value.subHeads.map(s => ({ ...s })),
      notes: value.notes.map(n => ({ ...n })),
    });
    if (value.subHeads.length && salaryMode) {
      const kind = value.payrollKind ?? resolvePayrollKind(value.title, value.subHeads);
      if (kind === "sales" || kind === "sales_lead") {
        setOpenSalaryIds(new Set(value.subHeads.map(s => s.id)));
      }
    }
  }, [open, value?.id, salaryMode]);

  if (!open || !value || !draft) return null;

  const payrollKind: PayrollKind =
    draft.payrollKind ??
    payrollKindProp ??
    (salaryMode ? resolvePayrollKind(draft.title, draft.subHeads) : "technical");
  const isSalesPayroll =
    payrollKind === "sales" ||
    payrollKind === "sales_lead" ||
    (salaryMode && isSalesTeamTitle(draft.title, draft.subHeads)) ||
    (salaryMode && /sales team/i.test(draft.title) && !/technical/i.test(draft.title)) ||
    draft.subHeads.some(s => !!s.salesPayroll);
  const salesPeers = salesSubsFromPeerRows(
    peerTeamRows.map(r => ({ title: r.title, subHeads: r.subHeads })),
    calcOpts,
  );
  const inventoryMode =
    allowInventory &&
    (inventoryModeProp || isInventoryAssetHead(draft.title, draft.subHeads));
  const inventoryFlat = inventoryMode && !matchInventoryCategory(draft.title);

  const salesPayrollContext = (): SalesPayrollData => ({
    salesTeamMembers: salesPeers.map(s => ensureSalesPayrollFromSub(s, "sales")),
    salesTeamLeads: peerTeamRows
      .filter(r => payrollKindForTeamTitle(r.title) === "sales_lead")
      .flatMap(r => (r.subHeads ?? []).map(sh => ensureSalesPayrollFromSub(sh, "team_lead"))),
  });

  const patchDraft = (patch: Partial<HeadDetailModel>) => {
    setDraft(prev => (prev ? { ...prev, ...patch } : prev));
  };

  const setField = <K extends keyof HeadDetailModel>(key: K, val: HeadDetailModel[K]) => {
    patchDraft({ [key]: val });
  };

  const updateSub = (id: string, patch: Partial<SubHeadEntry>) => {
    setDraft(prev => {
      if (!prev) return prev;
      const subHeads = prev.subHeads.map(s => (s.id === id ? { ...s, ...patch } : s));
      return {
        ...prev,
        subHeads,
        amount: sumSubHeads(subHeads),
      };
    });
  };

  const addSub = () => {
    const id = newRowId("sub");
    if (isSalesPayroll) {
      const role = payrollKind === "sales_lead" ? "team_lead" : "sales";
      const sp = emptySalesPayrollEmployee("New employee", role, 0, 0, id);
      setDraft(prev => {
        if (!prev) return prev;
        const subHeads = [
          ...prev.subHeads,
          { id, label: "New employee", amount: 0, filledAt: todayIso(), salesPayroll: sp },
        ];
        return { ...prev, subHeads, amount: sumSubHeads(subHeads) };
      });
      setOpenSalaryIds(prev => new Set(prev).add(id));
      return;
    }
    const isAdminKind = payrollKind === "admin";
    const isExecKind = payrollKind === "executive";
    const isTechMgrKind = payrollKind === "technical_manager";
    const salary = salaryMode
      ? isExecKind
        ? emptySalaryDetail({ commissionPct: 0, loanPositive: 0, loanNegative: 0 })
        : isAdminKind
          ? emptySalaryDetail({ checkIn: "18:00" })
          : isTechMgrKind
            ? emptySalaryDetail({ checkIn: "09:00", checkOut: "18:00" })
            : ensureSalaryDetail(undefined, 0)
      : undefined;
    const amount = salary
      ? isExecKind
        ? computeExecutiveSalary(salary, execProfitBase).totalPayable
        : isAdminKind
          ? computeAdminSalary(salary).totalSalary
          : isTechMgrKind
            ? computeTechnicalManagerSalary(salary).totalSalary
            : computeSalary(salary).totalSalary
      : 0;
    setDraft(prev => {
      if (!prev) return prev;
      const subHeads = [
        ...prev.subHeads,
        {
          id,
          label: salaryMode ? "New employee" : "New person / line",
          amount,
          filledAt: todayIso(),
          ...(salary ? { salary } : { manual: true }),
        },
      ];
      return { ...prev, subHeads, amount: sumSubHeads(subHeads) };
    });
    if (salaryMode) setOpenSalaryIds(prev => new Set(prev).add(id));
  };

  const removeSub = (id: string) => {
    setDraft(prev => {
      if (!prev) return prev;
      const subHeads = prev.subHeads.filter(s => s.id !== id);
      return {
        ...prev,
        subHeads,
        amount: subHeads.length > 0 ? sumSubHeads(subHeads) : prev.amount,
      };
    });
  };

  const handleProof = async (subId: string, file: File) => {
    if (!onUploadProof) return;
    setUploadingId(subId);
    try {
      const uploaded = await onUploadProof(file);
      updateSub(subId, { proofUrl: uploaded.fileUrl, proofName: uploaded.fileName });
    } finally {
      setUploadingId(null);
    }
  };

  const addNote = () => {
    patchDraft({
      notes: [{ id: newRowId("note"), text: "", date: todayIso() }, ...draft.notes],
    });
  };

  const updateNote = (id: string, patch: Partial<DatedNote>) => {
    patchDraft({
      notes: (() => {
        const next = draft.notes.map(n => {
          if (n.id !== id) return n;
          const bumped =
            patch.text !== undefined && patch.date === undefined
              ? { date: todayIso() }
              : {};
          return { ...n, ...patch, ...bumped };
        });
        // Edited / newest date first
        return [...next].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      })(),
    });
  };

  const removeNote = (id: string) => {
    patchDraft({ notes: draft.notes.filter(n => n.id !== id) });
  };

  const handleDone = () => {
    onSave(draft);
    onClose();
  };

  const sortedNotes = [...draft.notes].sort((a, b) => b.date.localeCompare(a.date));
  const toggleSalary = (id: string) => {
    setOpenSalaryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/40" onClick={onClose}>
      <div
        className={`bg-crm-surface rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-crm-border ${
          salaryMode || inventoryMode ? "max-w-3xl" : "max-w-lg"
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-crm-border-subtle bg-crm-muted flex items-center justify-between">
          <div>
            <h3 className="font-bold text-crm-text text-sm">{title}</h3>
            {isSalesPayroll && salaryMode && (
              <p className="text-[10px] font-bold text-emerald-700 mt-0.5">
                Sales payroll — project commission · 6 PM shift · no overtime
              </p>
            )}
            {payrollKind === "executive" && salaryMode && (
              <p className="text-[10px] font-bold text-indigo-700 mt-0.5">
                Executive payroll — Basic + commission (% of net profit) = total salary
              </p>
            )}
            {payrollKind === "technical_manager" && salaryMode && (
              <p className="text-[10px] font-bold text-violet-700 mt-0.5">
                Technical Manager — Technical Team formula · late shift 09:00 (relief ≤09:30)
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-crm-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <label className="text-xs font-semibold text-crm-text-secondary block">
            Title
            <input
              value={draft.title}
              onChange={e => setField("title", e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/30"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-crm-text-secondary block">
              {draft.subHeads.length > 0 ? "Total (auto from people / lines)" : "Total (add people/lines or set here)"}
              {draft.subHeads.length > 0 ? (
                <input
                  type="text"
                  readOnly
                  value={String(sumSubHeads(draft.subHeads))}
                  className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm bg-[#F8FAFC] text-crm-text-secondary cursor-default"
                />
              ) : (
                <AmountInput
                  value={Number(draft.amount) || 0}
                  onChange={n => setField("amount", n)}
                  className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/30"
                />
              )}
            </label>
            <label className="text-xs font-semibold text-crm-text-secondary block">
              Filled date
              <input
                type="date"
                value={draft.filledAt ?? todayIso()}
                onChange={e => setField("filledAt", e.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/30"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-crm-text-secondary inline-flex items-center gap-1.5">
                <StickyNote size={13} className="text-amber-500" /> Notes (by date)
              </p>
              <button type="button" onClick={addNote} className="text-[11px] font-bold text-amber-700 inline-flex items-center gap-1">
                <Plus size={12} /> Add note
              </button>
            </div>
            <div className="space-y-2 max-h-36 overflow-y-auto">
              {sortedNotes.length === 0 ? (
                <p className="text-[11px] text-crm-text-faint py-3 text-center border border-dashed border-amber-200 rounded-xl bg-amber-50/40">
                  No notes yet — add one with a date.
                </p>
              ) : (
                sortedNotes.map(n => (
                  <div key={n.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={n.date}
                        onChange={e => updateNote(n.id, { date: e.target.value })}
                        className="h-8 rounded-lg border border-amber-200 bg-white px-2 text-[11px] text-amber-950 dark:text-amber-950"
                      />
                      <button type="button" onClick={() => removeNote(n.id)} className="ml-auto text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <NoteComposer
                      value={n.text}
                      onChange={(text) => updateNote(n.id, { text })}
                      rows={2}
                      placeholder="Note… (Ctrl+B / I / U)"
                      className="!border-amber-200"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-crm-text-secondary">
                {inventoryMode
                  ? inventoryFlat
                    ? "Line items (QTY × Unit price = Total)"
                    : "Inventory (IT · Electrical · Furniture)"
                  : salaryMode
                    ? "Employees (full payroll)"
                    : "People / line items"}
              </p>
              {!inventoryMode && (
                <button type="button" onClick={addSub} className="text-[11px] font-bold text-[#0B84F3]">
                  + {salaryMode ? "Add employee" : "Add person / line"}
                </button>
              )}
            </div>

            {inventoryMode ? (
              <div className="max-h-[55vh] overflow-y-auto pr-0.5">
                <BemAssetInventoryEditor
                  subHeads={draft.subHeads}
                  headTitle={draft.title}
                  flatMode={inventoryFlat}
                  onChange={subHeads =>
                    setDraft(prev =>
                      prev
                        ? { ...prev, subHeads, amount: sumSubHeads(subHeads) }
                        : prev,
                    )
                  }
                />
              </div>
            ) : (
            <div className={`space-y-2 ${salaryMode ? "max-h-[55vh]" : "max-h-64"} overflow-y-auto`}>
              {draft.subHeads.length === 0 ? (
                <p className="text-[11px] text-crm-text-faint py-3 text-center border border-dashed rounded-xl">
                  No people yet — total uses the amount above.
                </p>
              ) : salaryMode ? (
                draft.subHeads.map(s => {
                  const openEd = openSalaryIds.has(s.id);
                  const subKind = salaryMode ? resolvePayrollKind(draft.title, [s]) : "technical";
                  const subIsSales =
                    isSalesPayroll ||
                    !!s.salesPayroll ||
                    subKind === "sales" ||
                    subKind === "sales_lead";
                  if (subIsSales) {
                    const role =
                      payrollKind === "sales_lead" || s.salesPayroll?.role === "team_lead"
                        ? "team_lead"
                        : "sales";
                    const sp = ensureSalesPayrollFromSub(s, role);
                    const extra =
                      payrollKind === "sales_lead" ? tlExtraFromPeers(s.id, salesPeers, calcOpts) : 0;
                    const net = netFromSalesSub({ ...s, salesPayroll: sp }, role, extra, calcOpts);
                    return (
                      <div key={s.id} className="rounded-xl border border-emerald-200 overflow-visible">
                        <div className="flex items-center gap-2 px-2.5 py-2 bg-[#ECFDF3]">
                          <button type="button" onClick={() => toggleSalary(s.id)} className="text-crm-text-muted">
                            {openEd ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <input
                            value={s.label}
                            onChange={e => updateSub(s.id, { label: e.target.value })}
                            className="flex-1 h-8 rounded-lg border border-crm-border bg-crm-surface px-2 text-xs font-semibold"
                            placeholder="Employee name"
                          />
                          <span className="text-xs font-bold tabular-nums text-[#1B6FE8] whitespace-nowrap">{currency(net)}</span>
                          <SalarySlipDownloadButton
                            sub={s}
                            kind={payrollKind === "sales_lead" ? "sales_lead" : "sales"}
                            recordDate={recordDate}
                            companyKey={salarySlipCompany}
                            salesExtra={extra}
                          />
                          <button type="button" onClick={() => removeSub(s.id)} className="text-red-500 px-1">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {openEd && (
                          <div className="p-2 border-t border-emerald-100">
                            <SalesPayrollEmployeeEditor
                              employee={{ ...sp, name: s.label }}
                              variant={payrollKind === "sales_lead" ? "team_lead" : "sales"}
                              allData={salesPayrollContext()}
                              embedded
                              defaultOpen
                              calcOpts={calcOpts}
                              onChange={next => {
                                const amount = netFromSalesSub(
                                  { ...s, salesPayroll: next, label: next.name },
                                  role,
                                  payrollKind === "sales_lead" ? tlExtraFromPeers(s.id, salesPeers, calcOpts) : 0,
                                  calcOpts,
                                );
                                updateSub(s.id, {
                                  label: next.name,
                                  salesPayroll: next,
                                  amount,
                                  salary: undefined,
                                });
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (payrollKind === "executive") {
                    const sal = ensureExecutiveSalaryDetail(s.salary, s.amount);
                    const exec = computeExecutiveSalary(sal, execProfitBase);
                    return (
                      <div key={s.id} className="rounded-xl border border-indigo-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-2.5 py-2 bg-indigo-50/60">
                          <button type="button" onClick={() => toggleSalary(s.id)} className="text-crm-text-muted">
                            {openEd ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <input
                            value={s.label}
                            onChange={e => updateSub(s.id, { label: e.target.value })}
                            className="flex-1 h-8 rounded-lg border border-crm-border bg-crm-surface px-2 text-xs font-semibold"
                            placeholder="Executive name"
                          />
                          <span className="text-[10px] font-bold text-indigo-600 whitespace-nowrap">{exec.commissionPct}%</span>
                          <span className="text-xs font-black tabular-nums text-[#1B6FE8] whitespace-nowrap" title="Total due = Salary + Loan+ve − Loan−ve + Occasional − PF">
                            Due {currency(exec.totalPayable)}
                          </span>
                          <SalarySlipDownloadButton
                            sub={s}
                            kind="executive"
                            recordDate={recordDate}
                            companyKey={salarySlipCompany}
                            execProfitBase={execProfitBase}
                          />
                          <button type="button" onClick={() => removeSub(s.id)} className="text-red-500 px-1">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {openEd && (
                          <div className="p-2 border-t border-indigo-100">
                            <ExecutiveSalaryEditor
                              name={s.label}
                              teamHint={draft.title}
                              value={sal}
                              profitBase={execProfitBase}
                              onChange={next => {
                                const hydrated = ensureExecutiveSalaryDetail(next, next.basic ?? 0);
                                const total = computeExecutiveSalary(hydrated, execProfitBase).totalPayable;
                                updateSub(s.id, { salary: hydrated, amount: total });
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  }
                  const isAdminSub = payrollKind === "admin";
                  const employeePayrollKind = resolveSubPayrollKind(s, draft.title, payrollKind);
                  const isTechMgrSub =
                    employeePayrollKind === "technical_manager" || payrollKind === "technical_manager";
                  const sal = isAdminSub
                    ? emptySalaryDetail({
                        ...(s.salary ?? { basic: s.amount }),
                        checkIn: s.salary?.checkIn || "18:00",
                      })
                    : isTechMgrSub
                      ? emptySalaryDetail({
                          ...(s.salary ?? { basic: s.amount }),
                          checkIn: s.salary?.checkIn || "09:00",
                          checkOut: s.salary?.checkOut || "18:00",
                        })
                      : ensureSalaryDetail(s.salary, s.amount);
                  const net = isAdminSub
                    ? computeAdminSalary(sal, s.label).totalSalary
                    : isTechMgrSub
                      ? computeTechnicalManagerSalary(sal, s.label).totalSalary
                      : computeSalary(sal, { personName: s.label }).totalSalary;
                  const slipKind =
                    isAdminSub ? "admin" : isTechMgrSub ? "technical_manager" : "technical";
                  const editorVariant =
                    isAdminSub ? "admin" : isTechMgrSub ? "technical_manager" : "technical";
                  return (
                    <div key={s.id} className="rounded-xl border border-crm-border overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-2 bg-[#F8FAFC]">
                        <button type="button" onClick={() => toggleSalary(s.id)} className="text-crm-text-muted">
                          {openEd ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <input
                          value={s.label}
                          onChange={e => updateSub(s.id, { label: e.target.value })}
                          className="flex-1 h-8 rounded-lg border border-crm-border bg-crm-surface px-2 text-xs font-semibold"
                          placeholder="Employee name"
                        />
                        <span className="text-xs font-bold tabular-nums text-[#1B6FE8] whitespace-nowrap">{currency(net)}</span>
                        <SalarySlipDownloadButton
                          sub={s}
                          kind={slipKind}
                          recordDate={recordDate}
                          companyKey={salarySlipCompany}
                        />
                        <button type="button" onClick={() => removeSub(s.id)} className="text-red-500 px-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {openEd && (
                        <div className="p-2 border-t border-crm-border-subtle">
                          <EmployeeSalaryEditor
                            name={s.label}
                            teamHint={draft.title}
                            value={sal}
                            variant={editorVariant}
                            onChange={next => {
                              const hydrated = emptySalaryDetail(next);
                              const total = isAdminSub
                                ? computeAdminSalary(hydrated, s.label).totalSalary
                                : isTechMgrSub
                                  ? computeTechnicalManagerSalary(hydrated, s.label).totalSalary
                                  : computeSalary(hydrated, { personName: s.label }).totalSalary;
                              updateSub(s.id, { salary: hydrated, amount: total });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                draft.subHeads.map(s => (
                  <div key={s.id} className="rounded-xl border border-crm-border-subtle bg-[#F8FAFC] p-2 space-y-1.5">
                    <div className="grid grid-cols-12 gap-1.5 items-center">
                      <input
                        value={s.label}
                        onChange={e => updateSub(s.id, { label: e.target.value })}
                        className="col-span-4 h-8 rounded-lg border border-crm-border px-2 text-xs bg-crm-surface"
                        placeholder="Label"
                      />
                      <AmountInput
                        value={Number(s.amount) || 0}
                        onChange={n => updateSub(s.id, { amount: n, userEdited: true })}
                        className="col-span-3 h-8 rounded-lg border border-crm-border px-2 text-xs text-right bg-crm-surface"
                      />
                      <input
                        type="date"
                        value={s.filledAt}
                        onChange={e => updateSub(s.id, { filledAt: e.target.value })}
                        className="col-span-3 h-8 rounded-lg border border-crm-border px-1 text-[10px] bg-crm-surface"
                      />
                        <button type="button" onClick={() => removeSub(s.id)} className="col-span-2 text-red-500 flex justify-center">
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {allowProofUpload && (
                      <ProofUploadField
                        proofUrl={s.proofUrl}
                        proofName={s.proofName}
                        disabled={uploadingId === s.id || !onUploadProof}
                        onUpload={async file => handleProof(s.id, file)}
                        onRemove={() => updateSub(s.id, { proofUrl: undefined, proofName: undefined })}
                        label="Upload bill / screenshot"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
            )}
            {draft.subHeads.length > 0 && !inventoryMode && (
              <p className="text-[11px] text-crm-text-muted mt-2 font-semibold">
                Team / section sum: {currency(sumSubHeads(draft.subHeads))}
              </p>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between gap-2 bg-[#FAFAFA]">
          <button
            type="button"
            onClick={() => { onDelete(); onClose(); }}
            className="h-9 px-3 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100"
          >
            Delete
          </button>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-crm-text-faint hidden sm:block">Changes save when you click Done</p>
            <button
              type="button"
              onClick={handleDone}
              disabled={saving}
              className="h-9 px-4 rounded-xl text-xs font-bold bg-[#1B6FE8] text-white hover:bg-[#9a0e26] disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
