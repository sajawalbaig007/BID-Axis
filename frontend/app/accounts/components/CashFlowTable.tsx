"use client";

import { Fragment, useState } from "react";
import { Plus, Landmark, CalendarDays, Pencil } from "lucide-react";
import type { CashFlowMonth, CashFlowRow } from "../types";
import { currency } from "../types";
import { TABLE_VARIANT, bankColor } from "./accountsTheme";
import AccountsNotesCell from "./AccountsNotesCell";
import CashFlowRowModal, { type CashFlowEditModel } from "./CashFlowRowModal";

function bankActivity(row: CashFlowRow): boolean {
  return Object.values(row.bankAmounts ?? {}).some(
    b => (Number(b.debit) || 0) !== 0 || (Number(b.credit) || 0) !== 0,
  );
}

export function computedNet(row: CashFlowRow): number {
  let debit = 0;
  let credit = 0;
  for (const b of Object.values(row.bankAmounts ?? {})) {
    debit += Number(b.debit) || 0;
    credit += Number(b.credit) || 0;
  }
  if (debit === 0 && credit === 0) return Number(row.netAmount) || 0;
  return debit - credit;
}

type CashFlowTableProps = {
  months: CashFlowMonth[];
  bankHeads: string[];
  onUpdateMonthTitle: (monthId: string, title: string) => void;
  onRemoveMonth: (monthId: string) => void;
  onUpdateRow: (monthId: string, rowId: string, patch: Partial<CashFlowRow>) => void;
  onUpdateBank: (monthId: string, rowId: string, bank: string, side: "debit" | "credit", val: number) => void;
  onRemoveRow: (monthId: string, rowId: string) => void;
  onAddRow: (monthId: string) => void;
  onPersist?: () => void;
};

export default function CashFlowTable({
  months,
  bankHeads,
  onUpdateMonthTitle,
  onRemoveMonth,
  onUpdateRow,
  onUpdateBank: _onUpdateBank,
  onRemoveRow,
  onAddRow,
  onPersist,
}: CashFlowTableProps) {
  const theme = TABLE_VARIANT.cashflow;
  const [editing, setEditing] = useState<CashFlowEditModel | null>(null);
  const [renamingMonthId, setRenamingMonthId] = useState<string | null>(null);

  if (months.length === 0) {
    return (
      <div className={`bg-crm-surface rounded-2xl border-2 p-12 text-center ${theme.card}`}>
        <Landmark size={32} className="mx-auto text-crm-text-faint mb-3" />
        <p className="text-crm-text-muted text-sm">No cashflow entries yet. Add a month section or new entry.</p>
      </div>
    );
  }

  const footerColSpan = 3 + bankHeads.length * 2;

  return (
    <div className="space-y-5">
      {months.map(month => {
        const sectionTotal = month.rows.reduce((a, r) => a + computedNet(r), 0);
        const renaming = renamingMonthId === month.id;
        return (
          <div key={month.id} className={`bg-crm-surface rounded-2xl border-2 overflow-hidden ${theme.card}`}>
            <div className={`px-4 py-3 border-b flex items-center gap-3 ${theme.header}`}>
              {renaming ? (
                <input
                  autoFocus
                  defaultValue={month.month}
                  onBlur={e => {
                    onUpdateMonthTitle(month.id, e.target.value.trim() || month.month);
                    setRenamingMonthId(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenamingMonthId(null);
                  }}
                  className={`flex-1 min-w-0 h-9 rounded-lg border border-white/40 bg-white/90 px-2 font-extrabold text-sm outline-none ${theme.headerText}`}
                />
              ) : (
                <p className={`flex-1 min-w-0 font-extrabold text-sm sm:text-base truncate ${theme.headerText}`}>
                  {month.month}
                </p>
              )}
              <button
                type="button"
                onClick={() => setRenamingMonthId(month.id)}
                className="w-8 h-8 rounded-lg text-[#0B84F3] hover:bg-[#EAF5FF] inline-flex items-center justify-center"
                title="Rename section"
              >
                <Pencil size={13} />
              </button>
              <button type="button" onClick={() => onAddRow(month.id)} className="h-8 px-3 rounded-lg bg-[#EAF5FF] text-[#0B84F3] text-[11px] font-bold inline-flex items-center gap-1">
                <Plus size={13} /> Row
              </button>
              <button type="button" onClick={() => onRemoveMonth(month.id)} className="text-[11px] font-semibold text-red-500 hover:underline px-2">
                Remove
              </button>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
              <table className="w-full text-sm" style={{ minWidth: `${780 + bankHeads.length * 128}px` }}>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-crm-border bg-[#FAFBFC]">
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-crm-text-muted w-[118px]">Date</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-crm-text-muted min-w-[160px]">Description</th>
                    {bankHeads.map((bank, bi) => (
                      <th key={bank} colSpan={2} className="px-1 py-2 text-center" style={{ borderBottom: `3px solid ${bankColor(bi)}` }}>
                        <span className="text-[10px] font-bold uppercase tracking-wide block" style={{ color: bankColor(bi) }}>{bank}</span>
                        <div className="flex justify-between text-[9px] font-semibold text-crm-text-faint mt-1 px-1">
                          <span>Dr</span><span>Cr</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-crm-text-muted min-w-[160px]">Notes</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#1B6FE8] w-[96px]">Net</th>
                    <th className="w-14 px-1 py-2.5 text-center text-[10px] font-bold uppercase text-crm-text-faint">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {month.rows.map(row => {
                    const net = computedNet(row);
                    const isAutoNet = bankActivity(row);
                    return (
                      <tr key={row.id} className={`border-b border-crm-border-subtle ${theme.rowHover} transition-colors`}>
                        <td className="px-2 py-2">
                          <span className="inline-flex items-center gap-1 text-xs text-crm-text-secondary whitespace-nowrap px-1">
                            <CalendarDays size={11} className="text-crm-text-faint" />
                            {row.date?.slice(0, 10) || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-sm text-crm-text font-medium truncate block max-w-[200px]" title={row.description}>
                            {row.description || "—"}
                          </span>
                        </td>
                        {bankHeads.map((bank, bi) => {
                          const b = row.bankAmounts?.[bank] ?? { debit: 0, credit: 0 };
                          const col = bankColor(bi);
                          return (
                            <Fragment key={bank}>
                              <td className="px-1 py-2" style={{ borderLeft: `2px solid ${col}18` }}>
                                <span className="block text-right text-xs tabular-nums text-[#334155] px-1">
                                  {b.debit ? currency(b.debit) : <span className="text-crm-text-faint">—</span>}
                                </span>
                              </td>
                              <td className="px-1 py-2" style={{ borderRight: `2px solid ${col}18` }}>
                                <span className="block text-right text-xs tabular-nums text-[#334155] px-1">
                                  {b.credit ? currency(b.credit) : <span className="text-crm-text-faint">—</span>}
                                </span>
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className="px-2 py-2 align-top">
                          <AccountsNotesCell notes={row.notes} fallbackDate={row.date} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className="text-sm font-bold text-[#1B6FE8] tabular-nums">{currency(net)}</span>
                          {isAutoNet && <span className="block text-[9px] text-crm-text-faint font-semibold">auto</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setEditing({
                              ...row,
                              monthId: month.id,
                              bankAmounts: row.bankAmounts ?? {},
                              notes: row.notes ?? [],
                            })}
                            className="w-8 h-8 rounded-lg text-[#0B84F3] hover:bg-[#EAF5FF] inline-flex items-center justify-center"
                            title="Edit in popup"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className={theme.footer}>
                    <td colSpan={footerColSpan} className="px-4 py-3 text-right text-sm font-bold text-crm-text">
                      Section Total
                    </td>
                    <td className="px-3 py-3 text-right font-extrabold text-[#1B6FE8] tabular-nums">{currency(sectionTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      <CashFlowRowModal
        open={!!editing}
        bankHeads={bankHeads}
        value={editing}
        onClose={() => {
          setEditing(null);
          onPersist?.();
        }}
        onSave={next => {
          onUpdateRow(next.monthId, next.id, {
            date: next.date,
            description: next.description,
            bankAmounts: next.bankAmounts,
            netAmount: next.netAmount,
            notes: next.notes,
          });
          setEditing(next);
        }}
        onDelete={() => {
          if (!editing) return;
          onRemoveRow(editing.monthId, editing.id);
          setEditing(null);
          onPersist?.();
        }}
      />
    </div>
  );
}
