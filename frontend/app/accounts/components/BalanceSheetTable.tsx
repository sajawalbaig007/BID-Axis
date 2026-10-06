"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import type { BalanceLineItem, BalanceSection } from "../types";
import {
  currency,
  inventoryLineTotal,
  lineAmount,
  normalizeNotes,
  subHeadLineAmount,
  sumSubHeads,
  todayIso,
} from "../types";
import { TABLE_VARIANT, type AccountsTableVariant } from "./accountsTheme";
import AccountsNotesCell from "./AccountsNotesCell";
import HeadDetailModal, { type HeadDetailModel } from "./HeadDetailModal";

function sumItems(items: BalanceLineItem[], useInventoryFormula = false) {
  return items.reduce((a, i) => {
    if (useInventoryFormula) return a + lineAmount(i);
    const subs = i.subHeads ?? [];
    if (subs.length > 0) return a + subs.reduce((x, s) => x + (Number(s.amount) || 0), 0);
    return a + (Number(i.amount) || 0);
  }, 0);
}

type BalanceSheetTableProps = {
  variant: AccountsTableVariant;
  groupTitle: string;
  sections: BalanceSection[];
  grandLabel?: string;
  onUpdateSectionTitle: (sectionId: string, title: string) => void;
  onUpdateItem: (sectionId: string, itemId: string, patch: Partial<BalanceLineItem>) => void;
  onDeleteItem: (sectionId: string, itemId: string) => void;
  onAddItem: (sectionId: string) => void;
  onAddSection: () => void;
};

export default function BalanceSheetTable({
  variant,
  groupTitle,
  sections,
  grandLabel,
  onUpdateSectionTitle: _onUpdateSectionTitle,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onAddSection,
}: BalanceSheetTableProps) {
  const theme = TABLE_VARIANT[variant];
  const inventoryEnabled = variant === "assets";
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<(HeadDetailModel & { sectionId: string }) | null>(null);
  const grandTotal = sections.reduce((a, s) => a + sumItems(s.items, inventoryEnabled), 0);

  const toggleItem = (id: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`bg-crm-surface rounded-2xl border-2 overflow-hidden ${theme.card}`}>
      <div className={`px-4 sm:px-5 py-3.5 border-b ${theme.header}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={`text-sm sm:text-base font-extrabold tracking-tight ${theme.headerText}`}>
            {groupTitle}
          </h2>
          <button
            type="button"
            onClick={onAddSection}
            className="h-8 px-3 rounded-lg text-[11px] font-bold text-white inline-flex items-center gap-1 shadow-sm"
            style={{ backgroundColor: theme.accent }}
          >
            <Plus size={13} />
            Add Section
          </button>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-crm-border/80 bg-[#FAFBFC]">
              <th className="w-8 px-1 py-2.5" />
              <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-crm-text-muted">Particulars</th>
              <th className="px-2 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-crm-text-muted min-w-[140px]">Notes</th>
              <th className="px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-crm-text-muted w-[100px]">Filled</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-crm-text-muted w-[120px]">Amount</th>
              <th className="w-16 px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-crm-text-muted">Edit</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <Fragment key={section.id}>
                <tr className="bg-[#FAFAFA]/90 border-y border-crm-border/60">
                  <td colSpan={4} className="px-3 py-2.5">
                    <p className="text-sm font-bold text-crm-text">{section.title}</p>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-[#475569] tabular-nums">
                    {currency(sumItems(section.items, inventoryEnabled))}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onAddItem(section.id)}
                      className="w-8 h-8 rounded-xl bg-[#EAF5FF] text-[#0B84F3] inline-flex items-center justify-center"
                      title="Add line"
                    >
                      <Plus size={14} />
                    </button>
                  </td>
                </tr>
                {section.items.map(item => {
                  const expanded = openItems.has(item.id);
                  const subs = item.subHeads ?? [];
                  const amt = lineAmount(item);
                  const showInventoryCols = inventoryEnabled && subs.length > 0;
                  return (
                    <Fragment key={item.id}>
                      <tr className={`border-b border-crm-border-subtle/80 ${theme.rowHover}`}>
                        <td className="px-1 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            className="w-7 h-7 rounded-lg text-crm-text-muted hover:bg-crm-muted inline-flex items-center justify-center"
                            title="Toggle individuals"
                          >
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-[#334155] font-medium">
                          {item.label}
                          {subs.length > 0 && (
                            <span className="ml-2 text-[10px] font-bold text-crm-text-faint">{subs.length}</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <AccountsNotesCell
                            notes={item.notes}
                            legacyNote={item.note}
                            fallbackDate={item.filledAt}
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center text-[11px] text-crm-text-muted">{item.filledAt || "—"}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-crm-text tabular-nums">{currency(amt)}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setEditing({
                              sectionId: section.id,
                              id: item.id,
                              title: item.label,
                              amount: item.amount,
                              filledAt: item.filledAt ?? todayIso(),
                              note: item.note ?? "",
                              subHeads: item.subHeads ?? [],
                              notes: normalizeNotes(item.notes, item.note, item.filledAt),
                            })}
                            className="w-8 h-8 rounded-lg text-[#0B84F3] hover:bg-[#EAF5FF] inline-flex items-center justify-center"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-[#F8FAFC]">
                          <td colSpan={6} className="px-4 py-2">
                            {subs.length === 0 ? (
                              <p className="text-[11px] text-crm-text-faint py-1">No individual heads — open Edit to add.</p>
                            ) : (
                              <div className="rounded-xl border border-crm-border-subtle overflow-hidden bg-crm-surface">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b bg-crm-surface-muted text-crm-text-muted">
                                      <th className="px-3 py-1.5 text-left font-semibold">Individual</th>
                                      {showInventoryCols && (
                                        <>
                                          <th className="px-3 py-1.5 text-right font-semibold w-[72px]">Qty</th>
                                          <th className="px-3 py-1.5 text-right font-semibold w-[100px]">Unit price</th>
                                        </>
                                      )}
                                      <th className="px-3 py-1.5 text-center font-semibold w-[110px]">Filled date</th>
                                      <th className="px-3 py-1.5 text-right font-semibold w-[100px]">
                                        {showInventoryCols ? "Total" : "Amount"}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subs.map(s => (
                                      <tr key={s.id} className="border-b border-crm-border-subtle">
                                        <td className="px-3 py-1.5 text-crm-text-secondary">{s.label}</td>
                                        {showInventoryCols && (
                                          <>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{s.qty ?? "—"}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">
                                              {currency(Number(s.unitPrice) || 0)}
                                            </td>
                                          </>
                                        )}
                                        <td className="px-3 py-1.5 text-center text-crm-text-muted">{s.filledAt || "—"}</td>
                                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                                          {currency(showInventoryCols ? subHeadLineAmount(s) : Number(s.amount) || 0)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className={theme.footer}>
              <td colSpan={4} className="px-4 py-3 font-extrabold text-crm-text">
                {grandLabel ?? "Total"}
              </td>
              <td className="px-3 py-3 text-right font-extrabold text-crm-text tabular-nums text-base">
                {currency(grandTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <HeadDetailModal
        open={!!editing}
        title={`Edit — ${groupTitle}`}
        value={editing}
        inventoryMode={inventoryEnabled}
        allowInventory={inventoryEnabled}
        onClose={() => setEditing(null)}
        onSave={next => {
          if (!editing) return;
          const subHeads = inventoryEnabled
            ? next.subHeads.map(s =>
                s.qty != null || s.unitPrice != null
                  ? {
                      ...s,
                      qty: Number(s.qty) || 0,
                      unitPrice: Number(s.unitPrice) || 0,
                      amount: inventoryLineTotal(s.qty, s.unitPrice, s.amount),
                    }
                  : s,
              )
            : next.subHeads;
          const amount = inventoryEnabled
            ? (subHeads.length > 0 ? sumSubHeads(subHeads) : next.amount)
            : subHeads.length > 0
              ? subHeads.reduce((a, s) => a + (Number(s.amount) || 0), 0)
              : next.amount;
          onUpdateItem(editing.sectionId, next.id, {
            label: next.title,
            note: next.notes[0]?.text ?? next.note,
            amount,
            filledAt: next.filledAt,
            subHeads,
            notes: next.notes,
          });
          setEditing({ ...editing, ...next, amount, subHeads });
        }}
        onDelete={() => {
          if (!editing) return;
          onDeleteItem(editing.sectionId, editing.id);
          setEditing(null);
        }}
      />
    </div>
  );
}

export { sumItems };
