"use client";

import { useEffect, useState, Fragment } from "react";
import { getAuthMe, peekAuthMe } from "@/lib/authMeCache";
import { ChevronDown, ChevronRight, FilePenLine, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { DatedNote, SubHeadEntry } from "../types";
import { currency, isInventoryAssetHead, lineAmount, normalizeNotes, newRowId, subHeadLineAmount, sumSubHeads, todayIso } from "../types";
import { computeAdminSalary, computeExecutiveSalary, computeSalary, computeTechnicalManagerSalary, emptySalaryDetail, ensureExecutiveSalaryDetail } from "../utils/payrollFormula";
import {
  resolvePayrollKind,
  resolveSubPayrollKind,
  payrollKindForTeamTitle,
  ensureSalesPayrollFromSub,
  tlExtraFromPeers,
  salesSubsFromPeerRows,
  normalizeSalesTeamSubs,
  isSalesTeamTitle,
  type PayrollKind,
} from "../utils/salesPayrollBridge";
import { computeSalesEmployeePayroll } from "../utils/salesPayrollFormula";
import { useSalesPayrollCalcOpts } from "../hooks/useSalesPayrollCalcOpts";
import AccountsNotesCell from "./AccountsNotesCell";
import HeadDetailModal, { type HeadDetailModel } from "./HeadDetailModal";
import ProofUploadField from "./ProofUploadField";
import SalarySlipDownloadButton from "./SalarySlipDownloadButton";
import SalarySlipTemplateEditorModal from "./SalarySlipTemplateEditorModal";
import { ensureSalaryDetail } from "./EmployeeSalaryEditor";
import AmountInput, { parseNonNegativeAmount } from "./AmountInput";
import type { SalarySlipCompanyKey } from "../utils/salarySlipCompanies";
import { DEFAULT_SALARY_SLIP_COMPANY } from "../utils/salarySlipCompanies";
import { slipKindTitle } from "../utils/salarySlipFieldConfig";
import { BEM_INVENTORY_CATEGORIES, matchInventoryCategory } from "../utils/bemAssetInventorySeed";

function moneyClose(a: number, b: number) {
  return Math.abs(a - b) < 0.009;
}

/** Same amount as the time rule stays automatic. Any other amount is a manual deduction. */
function deductionOverride(typed: number, calculated: number): number | null {
  return moneyClose(typed, calculated) ? null : typed;
}

export type ExpandableHeadRow = {
  id: string;
  title: string;
  amount: number;
  filledAt?: string;
  note?: string;
  subHeads?: SubHeadEntry[];
  notes?: DatedNote[];
  periodAmount?: number;
  allTimeAmount?: number;
};

type ExpandableHeadsTableProps = {
  title: string;
  accent?: string;
  rows: ExpandableHeadRow[];
  /** `opts.persist` asks the page to immediately save these rows to the DB. */
  onChange: (rows: ExpandableHeadRow[], opts?: { persist?: boolean }) => void;
  /** Save the whole record now (per-head / sub-head Save buttons). */
  onPersist?: () => void;
  saving?: boolean;
  addLabel?: string;
  emptyLabel?: string;
  allowProofUpload?: boolean;
  onUploadProof?: (file: File) => Promise<{ fileUrl: string; fileName: string }>;
  /** Team Salaries — full payroll editor in the edit modal. */
  salaryMode?: boolean;
  /** Net profit before executive salaries — commission base for Executive payroll. */
  execProfitBase?: number;
  /** Record date (YYYY-MM-DD) — salary slip month label. */
  recordDate?: string;
  /** Which company slip format to download (default BEM Solutions). */
  salarySlipCompany?: SalarySlipCompanyKey;
  /**
   * Custom sub-head delete. Return true if you already applied `nextRows`
   * (and any related clears); otherwise the table calls onChange itself.
   */
  onDeleteSubHead?: (args: {
    parent: ExpandableHeadRow;
    sub: SubHeadEntry;
    nextRows: ExpandableHeadRow[];
  }) => boolean | void;
  /** Show Per month + All time amount columns (Provident Fund). */
  amountSplit?: { periodLabel: string; allTimeLabel: string; periodReadOnly?: boolean };
  /** Head titles that cannot be deleted (e.g. standard PF heads). */
  lockedHeadTitles?: string[];
};

export default function ExpandableHeadsTable({
  title,
  accent = "#0B84F3",
  rows,
  onChange,
  onPersist,
  saving = false,
  addLabel = "Add Head",
  emptyLabel = "No heads yet.",
  allowProofUpload = false,
  onUploadProof,
  salaryMode = false,
  execProfitBase = 0,
  recordDate = todayIso(),
  salarySlipCompany = DEFAULT_SALARY_SLIP_COMPANY,
  onDeleteSubHead,
  amountSplit,
  lockedHeadTitles,
}: ExpandableHeadsTableProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<HeadDetailModel | null>(null);
  const [slipEditorKind, setSlipEditorKind] = useState<PayrollKind | null>(null);
  const calcOpts = useSalesPayrollCalcOpts(recordDate);
  const [role, setRole] = useState(() => peekAuthMe()?.role ?? "");
  useEffect(() => {
    const peeked = peekAuthMe()?.role;
    if (peeked) {
      if (peeked !== role) setRole(peeked);
      return;
    }
    void getAuthMe().then((user) => setRole(user?.role ?? ""));
  }, [role]);
  const canEditDeduction = role === "admin" || role === "accounts";

  const toggle = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addRow = () => {
    // Persist immediately so newly added heads survive reloads
    onChange(
      [
        ...rows,
        {
          id: newRowId("h"),
          title: "New Head",
          amount: 0,
          filledAt: todayIso(),
          subHeads: [],
          notes: [],
        },
      ],
      { persist: true },
    );
  };

  const saveEditing = (next: HeadDetailModel) => {
    setEditing(next);
    const salesPeers = salesSubsFromPeerRows(
      (next.payrollKind === "sales"
        ? rows.map(r =>
            r.id === next.id
              ? { title: next.title, subHeads: next.subHeads }
              : { title: r.title, subHeads: r.subHeads },
          )
        : rows.map(r => ({ title: r.title, subHeads: r.subHeads }))
      ),
      calcOpts,
    );
    // After sales / sales-lead edits, refresh lead nets so assigned TL commission lands in amount
    const nextRows = rows.map(r => {
      if (r.id === next.id) {
        const subHeads =
          next.payrollKind === "sales_lead"
            ? normalizeSalesTeamSubs(next.subHeads, next.title, salesPeers, calcOpts)
            : next.payrollKind === "sales"
              ? normalizeSalesTeamSubs(next.subHeads, next.title, [], calcOpts)
              : next.subHeads;
        return {
          ...r,
          title: next.title,
          amount: subHeads.length > 0
            ? sumSubHeads(subHeads)
            : next.amount,
          filledAt: next.filledAt,
          note: next.notes[0]?.text ?? next.note,
          subHeads,
          notes: next.notes,
        };
      }
      if (salaryMode && resolvePayrollKind(r.title, r.subHeads) === "sales_lead") {
        const peers =
          next.payrollKind === "sales"
            ? next.subHeads
            : salesSubsFromPeerRows(rows.map(x => ({ title: x.title, subHeads: x.subHeads })), calcOpts);
        const subHeads = normalizeSalesTeamSubs(r.subHeads, r.title, peers, calcOpts);
        return {
          ...r,
          subHeads,
          amount: sumSubHeads(subHeads),
        };
      }
      return r;
    });
    onChange(nextRows, { persist: true });
  };

  const deleteEditing = () => {
    if (!editing) return;
    if (lockedHeadTitles?.includes(editing.title)) {
      setEditing(null);
      return;
    }
    onChange(rows.filter(r => r.id !== editing.id), { persist: true });
    setEditing(null);
  };

  const patchSubProof = (
    rowId: string,
    subId: string,
    proof: { proofUrl: string; proofName: string } | { proofUrl?: undefined; proofName?: undefined },
  ) => {
    onChange(
      rows.map(r =>
        r.id !== rowId
          ? r
          : {
              ...r,
              subHeads: (r.subHeads ?? []).map(s => (s.id === subId ? { ...s, ...proof } : s)),
            },
      ),
    );
  };

  const patchSub = (rowId: string, subId: string, patch: Partial<SubHeadEntry>, persist = false) => {
    onChange(
      rows.map(r => {
        if (r.id !== rowId) return r;
        const subHeads = (r.subHeads ?? []).map(s => (s.id === subId ? { ...s, ...patch } : s));
        return {
          ...r,
          subHeads,
          amount: subHeads.length > 0 ? sumSubHeads(subHeads) : 0,
        };
      }),
      persist ? { persist: true } : undefined,
    );
  };

  const removeSubHead = (rowId: string, subId: string) => {
    const parent = rows.find(r => r.id === rowId);
    const removed = parent?.subHeads?.find(s => s.id === subId);
    if (!parent || !removed) return;
    const nextRows = rows.map(r => {
      if (r.id !== rowId) return r;
      const subHeads = (r.subHeads ?? []).filter(s => s.id !== subId);
      return {
        ...r,
        subHeads,
        amount: subHeads.length > 0 ? sumSubHeads(subHeads) : 0,
      };
    });
    const handled = onDeleteSubHead?.({ parent, sub: removed, nextRows });
    if (!handled) onChange(nextRows, { persist: true });
  };

  const openEdit = (row: ExpandableHeadRow) => {
    const kind = salaryMode ? resolvePayrollKind(row.title, row.subHeads) : "technical";
    const isSales = kind === "sales" || kind === "sales_lead" || isSalesTeamTitle(row.title, row.subHeads);
    const salesPeers = salesSubsFromPeerRows(rows.map(r => ({ title: r.title, subHeads: r.subHeads })), calcOpts);
    const subHeads = isSales ? normalizeSalesTeamSubs(row.subHeads, row.title, salesPeers, calcOpts) : (row.subHeads ?? []);
    if (isSales) {
      onChange(
        rows.map(r =>
          r.id === row.id
            ? { ...r, subHeads, amount: sumSubHeads(subHeads) }
            : r,
        ),
      );
    }
    setEditing({
      id: row.id,
      title: row.title,
      amount: row.amount,
      filledAt: row.filledAt ?? todayIso(),
      note: row.note,
      subHeads,
      notes: normalizeNotes(row.notes, row.note, row.filledAt),
      payrollKind: isSales ? (kind === "technical" ? payrollKindForTeamTitle(row.title) : kind) : kind,
    });
  };

  const total = rows.reduce((a, r) => {
    if (!salaryMode) return a + lineAmount(r);
    const kind = resolvePayrollKind(r.title, r.subHeads);
    if (kind === "executive") {
      return (
        a +
        (r.subHeads ?? []).reduce((sum, s) => {
          const ex = computeExecutiveSalary(
            ensureExecutiveSalaryDetail(s.salary, s.amount),
            execProfitBase,
          );
          return sum + ex.totalPayable;
        }, 0)
      );
    }
    if (kind === "sales" || kind === "sales_lead" || isSalesTeamTitle(r.title, r.subHeads)) {
      const peers = salesSubsFromPeerRows(rows, calcOpts);
      const subs = normalizeSalesTeamSubs(r.subHeads, r.title, peers, calcOpts);
      return a + subs.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    }
    return a + lineAmount(r);
  }, 0);

  return (
    <div className="bg-crm-surface rounded-2xl sm:rounded-3xl border border-crm-border-subtle overflow-hidden shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)]">
      <div
        className="px-4 py-3.5 border-b border-crm-border-subtle flex items-center justify-between gap-2"
        style={{ background: `linear-gradient(90deg, ${accent}12 0%, transparent 55%)` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: accent }} />
          <h2 className="font-extrabold text-crm-text text-sm tracking-tight truncate">{title}</h2>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="h-8 px-3 rounded-xl text-[11px] font-bold text-white inline-flex items-center gap-1 shadow-sm hover:opacity-95 transition-opacity shrink-0"
          style={{ backgroundColor: accent }}
        >
          <Plus size={13} /> {addLabel}
        </button>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="sticky top-0 z-10 bg-crm-muted/95 backdrop-blur-sm">
            <tr className="border-b border-crm-border">
              <th className="w-8 px-2 py-2.5" />
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-crm-text-faint">Head</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-crm-text-faint min-w-[160px]">Notes</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-crm-text-faint w-[100px]">Filled</th>
              {amountSplit ? (
                <>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-crm-text-faint w-[110px]">{amountSplit.periodLabel}</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-crm-text-faint w-[110px]">{amountSplit.allTimeLabel}</th>
                </>
              ) : (
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-crm-text-faint w-[110px]">Total</th>
              )}
              <th className="w-24 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-crm-text-faint">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={amountSplit ? 7 : 6} className="px-3 py-12 text-center text-crm-text-faint text-sm">{emptyLabel}</td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const expanded = openIds.has(row.id);
                const rowPayrollKind = salaryMode ? resolvePayrollKind(row.title, row.subHeads) : "technical";
                const isSalesRow =
                  salaryMode &&
                  (rowPayrollKind === "sales" ||
                    rowPayrollKind === "sales_lead" ||
                    isSalesTeamTitle(row.title, row.subHeads));
                const salesPeers = salesSubsFromPeerRows(rows, calcOpts);
                const subs = isSalesRow
                  ? normalizeSalesTeamSubs(row.subHeads, row.title, salesPeers, calcOpts)
                  : (row.subHeads ?? []);
                const isExecRow = salaryMode && rowPayrollKind === "executive";
                const isInventoryRow = isInventoryAssetHead(row.title, row.subHeads);
                const amt = isSalesRow
                  ? sumSubHeads(subs)
                  : isExecRow
                    ? subs.reduce((a, s) => {
                        const ex = computeExecutiveSalary(
                          ensureExecutiveSalaryDetail(s.salary, s.amount),
                          execProfitBase,
                        );
                        return a + ex.totalPayable;
                      }, 0)
                    : lineAmount(row);
                const periodAmt = amountSplit
                  ? (row.periodAmount ?? subs.reduce((a, s) => a + (Number(s.periodAmount ?? s.amount) || 0), 0))
                  : amt;
                const allTimeAmt = amountSplit
                  ? (row.allTimeAmount ?? subs.reduce((a, s) => a + (Number(s.allTimeAmount) || 0), 0))
                  : 0;
                return (
                  <Fragment key={row.id}>
                    <tr className={`border-b border-crm-border-subtle transition-colors ${idx % 2 === 0 ? "bg-crm-surface" : "bg-crm-surface-muted"} hover:bg-crm-surface-raised`}>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          className="w-7 h-7 rounded-lg text-crm-text-faint hover:text-crm-text-secondary hover:bg-crm-muted inline-flex items-center justify-center transition-colors"
                          title="Toggle individuals"
                        >
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-crm-text">
                        {row.title}
                        {subs.length > 0 && (
                          <span
                            className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white/95"
                            style={{ backgroundColor: accent }}
                          >
                            {subs.length}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <AccountsNotesCell
                          notes={row.notes}
                          legacyNote={row.note}
                          fallbackDate={row.filledAt}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-crm-text-muted tabular-nums">{row.filledAt || "—"}</td>
                      {amountSplit ? (
                        <>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-crm-text">{currency(periodAmt)}</td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-teal-800">{currency(allTimeAmt)}</td>
                        </>
                      ) : (
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-crm-text">{currency(amt)}</td>
                      )}
                      <td className="px-2 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          {salaryMode && (
                            <button
                              type="button"
                              onClick={() => setSlipEditorKind(rowPayrollKind)}
                              className="w-8 h-8 rounded-lg text-[#1B6FE8] hover:bg-[#EAF2FE] inline-flex items-center justify-center transition-colors"
                              title={`Edit ${slipKindTitle(rowPayrollKind)} salary-slip template`}
                            >
                              <FilePenLine size={14} />
                            </button>
                          )}
                          {onPersist && (
                            <button
                              type="button"
                              onClick={onPersist}
                              disabled={saving}
                              className="w-8 h-8 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center transition-colors disabled:opacity-50"
                              title="Save this head to the record"
                            >
                              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="w-8 h-8 rounded-lg text-[#0B84F3] hover:bg-[#EAF5FF] inline-flex items-center justify-center transition-colors"
                            title="Edit in popup"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (lockedHeadTitles?.includes(row.title)) return;
                              onChange(rows.filter(r => r.id !== row.id), { persist: true });
                            }}
                            disabled={lockedHeadTitles?.includes(row.title)}
                            className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            title={lockedHeadTitles?.includes(row.title) ? "This PF head stays on the statement" : "Delete"}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-[#F8FAFC]">
                        <td colSpan={amountSplit ? 7 : 6} className="px-4 py-2.5">
                          {subs.length === 0 ? (
                            <p className="text-[11px] text-crm-text-faint py-1">No individual heads — open Edit to add sub-heads.</p>
                          ) : isInventoryRow ? (
                            <div className="space-y-3">
                              {(matchInventoryCategory(row.title)
                                ? [matchInventoryCategory(row.title)!]
                                : [...BEM_INVENTORY_CATEGORIES]
                              ).map(cat => {
                                const catRows = matchInventoryCategory(row.title)
                                  ? subs
                                  : subs.filter(s => (s.inventoryCategory || "IT Inventory") === cat);
                                if (catRows.length === 0 && !matchInventoryCategory(row.title)) return null;
                                return (
                                  <div key={cat} className="rounded-xl border border-teal-100 overflow-x-auto bg-crm-surface shadow-sm">
                                    <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#0F766E] bg-teal-50/80 border-b border-teal-100">
                                      {cat}
                                    </p>
                                    <table className="w-full text-xs min-w-[520px]">
                                      <thead>
                                        <tr className="border-b bg-crm-surface-muted text-crm-text-faint">
                                          <th className="px-2 py-2 text-left font-bold uppercase tracking-wide text-[9px] w-10">SR#</th>
                                          <th className="px-2 py-2 text-left font-bold uppercase tracking-wide text-[9px]">Description</th>
                                          <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px] w-16">Qty</th>
                                          <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px] w-24">Unit price</th>
                                          <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px] w-24">Total price</th>
                                          {onPersist && <th className="w-10 px-1 py-2" />}
                                          <th className="w-10 px-1 py-2" />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {catRows.map((s, i) => (
                                          <tr key={s.id} className="border-b border-crm-border-subtle last:border-0">
                                            <td className="px-2 py-2 text-crm-text-faint tabular-nums">{i + 1}</td>
                                            <td className="px-2 py-2 text-crm-text-secondary font-medium">{s.label}</td>
                                            <td className="px-2 py-2 text-right tabular-nums">{s.qty ?? "—"}</td>
                                            <td className="px-2 py-2 text-right tabular-nums">{currency(Number(s.unitPrice) || 0)}</td>
                                            <td className="px-2 py-2 text-right font-bold tabular-nums text-[#1B6FE8]">
                                              {currency(subHeadLineAmount(s))}
                                            </td>
                                            {onPersist && (
                                              <td className="px-1 py-2 text-center">
                                                <button
                                                  type="button"
                                                  onClick={onPersist}
                                                  disabled={saving}
                                                  className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center disabled:opacity-50"
                                                  title="Save this row"
                                                >
                                                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                                </button>
                                              </td>
                                            )}
                                            <td className="px-1 py-2 text-center">
                                              <button
                                                type="button"
                                                onClick={() => removeSubHead(row.id, s.id)}
                                                className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                                                title="Delete this line"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t bg-teal-50/40">
                                          <td colSpan={4} className="px-2 py-2 text-[10px] font-extrabold uppercase text-teal-900">
                                            Subtotal
                                          </td>
                                          <td className="px-2 py-2 text-right font-black tabular-nums text-[#1B6FE8]">
                                            {currency(sumSubHeads(catRows))}
                                          </td>
                                          <td colSpan={onPersist ? 2 : 1} />
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                );
                              })}
                              <p className="text-[10px] text-crm-text-faint px-1">
                                TOTAL = QTY × Unit price · Open Edit to add / change lines.
                              </p>
                            </div>
                          ) : salaryMode && rowPayrollKind === "executive" ? (
                            <div className="rounded-xl border border-indigo-100 overflow-x-auto bg-crm-surface shadow-sm">
                              <table className="w-full text-xs min-w-[960px]">
                                <thead>
                                  <tr className="border-b bg-indigo-50/60 text-crm-text-faint">
                                    <th className="px-2 py-2 text-left font-bold uppercase tracking-wide text-[9px]">Executive</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Basic</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Comm. %</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Commission</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Salary</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Loan +ve</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Loan −ve</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Occas.</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">PF</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px] text-[#1B6FE8]">Total Due</th>
                                    <th className="px-2 py-2 text-left font-bold uppercase tracking-wide text-[9px]">Remarks</th>
                                    <th className="w-10 px-1 py-2 text-center font-bold uppercase tracking-wide text-[9px]">Slip</th>
                                    {onPersist && <th className="w-10 px-1 py-2 text-center font-bold uppercase tracking-wide text-[9px]">Save</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {subs.map(s => {
                                    const sal = ensureExecutiveSalaryDetail(s.salary, s.amount);
                                    const ex = computeExecutiveSalary(sal, execProfitBase);
                                    return (
                                      <tr key={s.id} className="border-b border-crm-border-subtle last:border-0">
                                        <td className="px-2 py-2 text-crm-text-secondary font-medium whitespace-nowrap">{s.label}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{currency(ex.basic)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-indigo-700">{ex.commissionPct}%</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{currency(ex.commission)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{currency(ex.totalSalary)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{currency(ex.loanPositive)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-red-600">{currency(ex.loanNegative)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-sky-700">{currency(ex.occasionalAmount)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-teal-800">{currency(ex.pf)}</td>
                                        <td className="px-2 py-2 text-right font-extrabold tabular-nums text-[#1B6FE8] bg-[#FFF6F8]/80">
                                          {currency(ex.totalPayable)}
                                        </td>
                                        <td className="px-2 py-2 text-crm-text-muted max-w-[140px] truncate" title={sal.remarks || undefined}>{sal.remarks || "—"}</td>
                                        <td className="px-1 py-2 text-center">
                                          <SalarySlipDownloadButton
                                            compact
                                            sub={s}
                                            kind="executive"
                                            recordDate={recordDate}
                                            companyKey={salarySlipCompany}
                                            execProfitBase={execProfitBase}
                                          />
                                        </td>
                                        {onPersist && (
                                          <td className="px-1 py-2 text-center">
                                            <button
                                              type="button"
                                              onClick={onPersist}
                                              disabled={saving}
                                              className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center disabled:opacity-50"
                                              title="Save this row"
                                            >
                                              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-indigo-100 bg-indigo-50/50">
                                    <td colSpan={9} className="px-2 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
                                      All executives — total due
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-black tabular-nums text-[#1B6FE8] text-sm">
                                      {currency(
                                        subs.reduce((a, s) => {
                                          const ex = computeExecutiveSalary(
                                            ensureExecutiveSalaryDetail(s.salary, s.amount),
                                            execProfitBase,
                                          );
                                          return a + ex.totalPayable;
                                        }, 0),
                                      )}
                                    </td>
                                    <td colSpan={onPersist ? 3 : 2} />
                                  </tr>
                                </tfoot>
                              </table>
                              <p className="px-3 py-1.5 text-[10px] text-crm-text-faint border-t">
                                {(() => {
                                  const base = Math.max(0, execProfitBase);
                                  const distributed = subs.reduce(
                                    (a, s) =>
                                      a +
                                      computeExecutiveSalary(
                                        ensureExecutiveSalaryDetail(s.salary, s.amount),
                                        execProfitBase,
                                      ).commission,
                                    0,
                                  );
                                  return `Total Due = Salary + Loan+ve − Loan−ve + Occasional − PF · Net profit base: ${currency(base)} · Commissions: ${currency(distributed)} · Remaining (company): ${currency(base - distributed)}`;
                                })()}
                              </p>
                            </div>
                          ) : salaryMode ? (
                            <div className="rounded-xl border border-crm-border-subtle overflow-x-auto bg-crm-surface shadow-sm">
                              <table className="w-full text-xs min-w-[1140px]">
                                <thead>
                                  <tr className="border-b bg-crm-surface-muted text-crm-text-faint">
                                    <th className="px-2 py-2 text-left font-bold uppercase tracking-wide text-[9px]">Employee</th>
                                    {isSalesRow ? (
                                      <>
                                        <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Commission</th>
                                        <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Basic</th>
                                        <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Allow.</th>
                                      </>
                                    ) : (
                                      <>
                                        <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Basic</th>
                                        <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Allow.</th>
                                        <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">OT</th>
                                        <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Earning</th>
                                      </>
                                    )}
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Deduction</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Unpaid</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Loan</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Remaining</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">PF</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Tax</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Deduct</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Occas.</th>
                                    <th className="px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">After deduction</th>
                                    <th className="w-10 px-1 py-2 text-center font-bold uppercase tracking-wide text-[9px]">Slip</th>
                                    {onPersist && <th className="w-10 px-1 py-2 text-center font-bold uppercase tracking-wide text-[9px]">Save</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {subs.map(s => {
                                    if (isSalesRow) {
                                      const role = rowPayrollKind === "sales_lead" ? "team_lead" : "sales";
                                      const sp = ensureSalesPayrollFromSub(s, role);
                                      const extra = rowPayrollKind === "sales_lead" ? tlExtraFromPeers(s.id, salesPeers, calcOpts) : 0;
                                      const b = computeSalesEmployeePayroll(sp, extra, calcOpts);
                                      return (
                                        <tr key={s.id} className="border-b border-crm-border-subtle last:border-0">
                                          <td className="px-2 py-2 text-crm-text-secondary font-medium whitespace-nowrap">{s.label}</td>
                                          <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{currency(b.totalCommission + extra)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{currency(sp.basic)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{currency(sp.allowance)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums" title={b.lateRuleApplied}>
                                            {canEditDeduction ? (
                                              <AmountInput
                                                aria-label={`${s.label} deduction`}
                                                value={b.lateDeduction}
                                                onChange={(typed) => {
                                                  const calculated = computeSalesEmployeePayroll(
                                                    { ...sp, lateDeductionOverride: null },
                                                    extra,
                                                    calcOpts,
                                                  ).lateDeduction;
                                                  const next = { ...sp, lateDeductionOverride: deductionOverride(typed, calculated) };
                                                  const net = computeSalesEmployeePayroll(next, extra, calcOpts).netSalary;
                                                  patchSub(row.id, s.id, { salesPayroll: next, amount: net });
                                                }}
                                                className="h-7 w-[4.75rem] rounded-md border border-amber-200 bg-amber-50 px-1.5 text-right text-xs tabular-nums text-amber-950 outline-none focus:border-[#1B6FE8] dark:border-amber-900 dark:bg-[#0B1220] dark:text-white"
                                              />
                                            ) : (
                                              currency(b.lateDeduction)
                                            )}
                                          </td>
                                          <td className="px-2 py-2 text-right tabular-nums">{currency(b.unpaidLeaveDeduction)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{currency(sp.loanThisMonth)}</td>
                                          <td className={`px-2 py-2 text-right tabular-nums ${b.loanRemaining > 0 ? "text-orange-800 font-semibold" : ""}`}>
                                            {b.loanRemaining > 0 ? currency(b.loanRemaining) : "—"}
                                          </td>
                                          <td className="px-2 py-2 text-right tabular-nums">{currency(b.pf)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{currency(sp.incomeTax)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums text-red-600">{currency(b.totalDeduction)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums text-sky-700">{currency(b.occasionalAmount ?? 0)}</td>
                                          <td className="px-2 py-2 text-right font-bold tabular-nums text-[#1B6FE8]">{currency(b.netSalary)}</td>
                                          <td className="px-1 py-2 text-center">
                                            <SalarySlipDownloadButton
                                              compact
                                              sub={s}
                                              kind={rowPayrollKind === "sales_lead" ? "sales_lead" : "sales"}
                                              recordDate={recordDate}
                                              companyKey={salarySlipCompany}
                                              salesExtra={extra}
                                            />
                                          </td>
                                          {onPersist && (
                                            <td className="px-1 py-2 text-center">
                                              <button
                                                type="button"
                                                onClick={onPersist}
                                                disabled={saving}
                                                className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center disabled:opacity-50"
                                                title="Save this row"
                                              >
                                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                              </button>
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    }
                                    const subKind = resolveSubPayrollKind(s, row.title, rowPayrollKind);
                                    const sal = s.salary ? ensureSalaryDetail(s.salary, s.amount) : null;
                                    const b = sal
                                      ? subKind === "admin"
                                        ? computeAdminSalary(sal, s.label)
                                        : subKind === "technical_manager"
                                          ? computeTechnicalManagerSalary(sal, s.label)
                                          : computeSalary(sal, { personName: s.label })
                                      : null;
                                    const slipKind =
                                      subKind === "admin"
                                        ? "admin"
                                        : subKind === "technical_manager"
                                          ? "technical_manager"
                                          : "technical";
                                    return (
                                      <tr key={s.id} className="border-b border-crm-border-subtle last:border-0">
                                        <td className="px-2 py-2 text-crm-text-secondary font-medium whitespace-nowrap">{s.label}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{b ? currency(sal!.basic) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{b ? currency(sal!.allowance) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{b ? currency(b.totalOvertime) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{b ? currency(b.totalEarning) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums" title={b?.lateRuleApplied}>
                                          {b && canEditDeduction && sal ? (
                                            <AmountInput
                                              aria-label={`${s.label} deduction`}
                                              value={b.lateDeduction}
                                              onChange={(typed) => {
                                                const bare = emptySalaryDetail({ ...sal, lateDeductionOverride: null });
                                                const calculated = subKind === "admin"
                                                  ? computeAdminSalary(bare, s.label).lateDeduction
                                                  : subKind === "technical_manager"
                                                    ? computeTechnicalManagerSalary(bare, s.label).lateDeduction
                                                    : computeSalary(bare, { personName: s.label }).lateDeduction;
                                                const nextSal = emptySalaryDetail({
                                                  ...sal,
                                                  lateDeductionOverride: deductionOverride(typed, calculated),
                                                });
                                                const nextBreak = subKind === "admin"
                                                  ? computeAdminSalary(nextSal, s.label)
                                                  : subKind === "technical_manager"
                                                    ? computeTechnicalManagerSalary(nextSal, s.label)
                                                    : computeSalary(nextSal, { personName: s.label });
                                                patchSub(row.id, s.id, { salary: nextSal, amount: nextBreak.totalSalary });
                                              }}
                                              className="h-7 w-[4.75rem] rounded-md border border-amber-200 bg-amber-50 px-1.5 text-right text-xs tabular-nums text-amber-950 outline-none focus:border-[#1B6FE8] dark:border-amber-900 dark:bg-[#0B1220] dark:text-white"
                                            />
                                          ) : b ? (
                                            currency(b.lateDeduction)
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums">{b ? currency(b.unpaidLeaveDeduction) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{b ? currency(b.loanThisMonth) : "—"}</td>
                                        <td className={`px-2 py-2 text-right tabular-nums ${b && b.loanRemaining > 0 ? "text-orange-800 font-semibold" : ""}`}>
                                          {b && b.loanRemaining > 0 ? currency(b.loanRemaining) : "—"}
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums">{b ? currency(b.pf) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{b ? currency(b.incomeTax) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-red-600">{b ? currency(b.totalDeduction) : "—"}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-sky-700">{b ? currency(b.occasionalAmount ?? 0) : "—"}</td>
                                        <td className="px-2 py-2 text-right font-bold tabular-nums text-[#1B6FE8]">{b ? currency(b.totalSalary) : currency(s.amount)}</td>
                                        <td className="px-1 py-2 text-center">
                                          <SalarySlipDownloadButton
                                            compact
                                            sub={s}
                                            kind={slipKind}
                                            recordDate={recordDate}
                                            companyKey={salarySlipCompany}
                                          />
                                        </td>
                                        {onPersist && (
                                          <td className="px-1 py-2 text-center">
                                            <button
                                              type="button"
                                              onClick={onPersist}
                                              disabled={saving}
                                              className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center disabled:opacity-50"
                                              title="Save this row"
                                            >
                                              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              <p className="px-3 py-1.5 text-[10px] text-crm-text-faint border-t">
                                Deduction follows the check-in time ranges. After deduction is the salary once that cut and the other cuts are taken. CEO and Accounts can type a different amount. Save the record to keep it.
                              </p>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-crm-border-subtle overflow-hidden bg-crm-surface shadow-sm">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-crm-surface-muted text-crm-text-faint">
                                    <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-[10px]">Individual</th>
                                    <th className="px-3 py-2 text-center font-bold uppercase tracking-wide text-[10px] w-[110px]">Filled date</th>
                                    {allowProofUpload && (
                                      <th className="px-3 py-2 text-center font-bold uppercase tracking-wide text-[10px] w-[120px]">Image</th>
                                    )}
                                    {amountSplit ? (
                                      <>
                                        <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[10px] w-[110px]">{amountSplit.periodLabel}</th>
                                        <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[10px] w-[110px]">{amountSplit.allTimeLabel}</th>
                                      </>
                                    ) : (
                                      <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[10px] w-[100px]">Amount</th>
                                    )}
                                    {onPersist && <th className="px-2 py-2 text-center font-bold uppercase tracking-wide text-[10px] w-[50px]">Save</th>}
                                    <th className="px-2 py-2 text-center font-bold uppercase tracking-wide text-[10px] w-[50px]">Del</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subs.map(s => (
                                    <tr key={s.id} className="border-b border-crm-border-subtle last:border-0">
                                      <td className="px-3 py-2">
                                        <input
                                          value={s.label}
                                          onChange={e => patchSub(row.id, s.id, { label: e.target.value })}
                                          onBlur={e => patchSub(row.id, s.id, { label: e.currentTarget.value }, true)}
                                          className="w-full h-8 rounded-lg border border-crm-border bg-crm-surface px-2 text-xs font-medium text-crm-text-secondary outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                                          placeholder="Name"
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <input
                                          type="date"
                                          value={s.filledAt || ""}
                                          onChange={e => patchSub(row.id, s.id, { filledAt: e.target.value }, true)}
                                          className="h-8 rounded-lg border border-crm-border bg-crm-surface px-1 text-[10px] text-crm-text-muted outline-none"
                                        />
                                      </td>
                                      {allowProofUpload && (
                                        <td className="px-3 py-2 text-center">
                                          <ProofUploadField
                                            compact
                                            proofUrl={s.proofUrl}
                                            proofName={s.proofName}
                                            disabled={!onUploadProof}
                                            onUpload={async file => {
                                              if (!onUploadProof) return;
                                              const uploaded = await onUploadProof(file);
                                              patchSubProof(row.id, s.id, {
                                                proofUrl: uploaded.fileUrl,
                                                proofName: uploaded.fileName,
                                              });
                                            }}
                                          />
                                        </td>
                                      )}
                                      {amountSplit ? (
                                        <>
                                          <td className="px-3 py-2 text-right">
                                            {amountSplit.periodReadOnly ? (
                                              <span className="text-xs font-semibold tabular-nums text-crm-text">
                                                {currency(Number(s.periodAmount ?? s.amount) || 0)}
                                              </span>
                                            ) : (
                                              <AmountInput
                                                value={Number(s.amount) || 0}
                                                onChange={n => patchSub(row.id, s.id, { amount: n, periodAmount: n, userEdited: true })}
                                                onBlur={e => {
                                                  const n = parseNonNegativeAmount((e.target as HTMLInputElement).value);
                                                  patchSub(row.id, s.id, { amount: n, periodAmount: n, userEdited: true }, true);
                                                }}
                                                className="h-8 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-xs text-right font-semibold outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                                              />
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-teal-800">{currency(Number(s.allTimeAmount) || 0)}</td>
                                        </>
                                      ) : (
                                        <td className="px-3 py-2 text-right">
                                          <AmountInput
                                            value={Number(s.amount) || 0}
                                            onChange={n => patchSub(row.id, s.id, { amount: n })}
                                            onBlur={e => {
                                              const n = parseNonNegativeAmount((e.target as HTMLInputElement).value);
                                              patchSub(row.id, s.id, { amount: n }, true);
                                            }}
                                            className="h-8 w-full rounded-lg border border-crm-border bg-crm-surface px-2 text-xs text-right font-semibold outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                                          />
                                        </td>
                                      )}
                                      {onPersist && (
                                        <td className="px-2 py-2 text-center">
                                          <button
                                            type="button"
                                            onClick={onPersist}
                                            disabled={saving}
                                            className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center disabled:opacity-50"
                                            title="Save this row"
                                          >
                                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                          </button>
                                        </td>
                                      )}
                                      <td className="px-2 py-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => removeSubHead(row.id, s.id)}
                                          className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center transition-colors"
                                          title="Delete this line"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {allowProofUpload && (
                                <p className="px-3 py-1.5 text-[10px] text-crm-text-faint border-t">
                                  Upload bill/screenshot per line · Preview anytime · Save record when done.
                                </p>
                              )}
                            </div>
                          )}
                          {onPersist && subs.length > 0 && (
                            <div className="flex justify-end mt-2">
                              <button
                                type="button"
                                onClick={onPersist}
                                disabled={saving}
                                className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                                title="Save these sub-heads to the record"
                              >
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                Save Sub-heads
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: `${accent}33`, background: `${accent}0D` }}>
              <td colSpan={4} className="px-3 py-3.5 font-extrabold text-crm-text">Section Total</td>
              <td className="px-3 py-3.5 text-right font-extrabold tabular-nums text-base" style={{ color: accent }}>
                {currency(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <HeadDetailModal
        open={!!editing}
        title={`Edit — ${title}`}
        value={editing}
        onClose={() => setEditing(null)}
        onSave={saveEditing}
        onDelete={deleteEditing}
        allowProofUpload={allowProofUpload}
        onUploadProof={onUploadProof}
        salaryMode={salaryMode}
        inventoryMode={editing ? isInventoryAssetHead(editing.title, editing.subHeads) : false}
        saving={saving}
        execProfitBase={execProfitBase}
        recordDate={recordDate}
        calcOpts={calcOpts}
        salarySlipCompany={salarySlipCompany}
        payrollKind={editing?.payrollKind ?? (editing ? resolvePayrollKind(editing.title, editing.subHeads) : undefined)}
        peerTeamRows={rows.map(r => ({
          id: r.id,
          title: r.title,
          amount: r.amount,
          filledAt: r.filledAt,
          subHeads: r.subHeads ?? [],
          notes: normalizeNotes(r.notes, r.note, r.filledAt),
        }))}
      />

      <SalarySlipTemplateEditorModal
        open={!!slipEditorKind}
        kind={slipEditorKind}
        onClose={() => setSlipEditorKind(null)}
      />
    </div>
  );
}
