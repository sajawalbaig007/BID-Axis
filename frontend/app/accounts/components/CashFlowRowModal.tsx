"use client";

import { Trash2, X, Plus, StickyNote } from "lucide-react";
import type { CashFlowRow, DatedNote } from "../types";
import { currency, newRowId, normalizeNotes, todayIso } from "../types";
import { bankColor } from "./accountsTheme";
import AmountInput from "./AmountInput";
import { NoteComposer } from "@/lib/noteRichText";

export type CashFlowEditModel = CashFlowRow & { monthId: string };

type CashFlowRowModalProps = {
  open: boolean;
  bankHeads: string[];
  value: CashFlowEditModel | null;
  onClose: () => void;
  onSave: (next: CashFlowEditModel) => void;
  onDelete: () => void;
};

export default function CashFlowRowModal({
  open,
  bankHeads,
  value,
  onClose,
  onSave,
  onDelete,
}: CashFlowRowModalProps) {
  if (!open || !value) return null;

  const notes = normalizeNotes(value.notes, undefined, value.date);
  const sortedNotes = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  let debitTotal = 0;
  let creditTotal = 0;
  for (const b of Object.values(value.bankAmounts ?? {})) {
    debitTotal += Number(b.debit) || 0;
    creditTotal += Number(b.credit) || 0;
  }
  const net = debitTotal === 0 && creditTotal === 0
    ? Number(value.netAmount) || 0
    : debitTotal - creditTotal;
  const isAutoNet = debitTotal !== 0 || creditTotal !== 0;

  const setField = <K extends keyof CashFlowRow>(key: K, val: CashFlowRow[K]) => {
    onSave({ ...value, [key]: val });
  };

  const setBank = (bank: string, side: "debit" | "credit", val: number) => {
    const bankAmounts = {
      ...value.bankAmounts,
      [bank]: { ...(value.bankAmounts?.[bank] ?? { debit: 0, credit: 0 }), [side]: val },
    };
    let d = 0;
    let c = 0;
    for (const b of Object.values(bankAmounts)) {
      d += Number(b.debit) || 0;
      c += Number(b.credit) || 0;
    }
    onSave({
      ...value,
      bankAmounts,
      netAmount: d === 0 && c === 0 ? value.netAmount : d - c,
    });
  };

  const setNotes = (next: DatedNote[]) => setField("notes", next);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-crm-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b bg-[#F8FAFC] flex items-center justify-between">
          <h3 className="font-bold text-crm-text text-sm">Edit cash flow entry</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-crm-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-crm-text-secondary block">
              Date
              <input
                type="date"
                value={value.date?.slice(0, 10) ?? ""}
                onChange={e => setField("date", e.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/30"
              />
            </label>
            <label className="text-xs font-semibold text-crm-text-secondary block">
              Net {isAutoNet ? "(auto)" : ""}
              {isAutoNet ? (
                <input
                  type="text"
                  readOnly
                  value={String(net)}
                  className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm bg-[#F8FAFC] text-crm-text-secondary cursor-default"
                />
              ) : (
                <AmountInput
                  value={Number(net) || 0}
                  onChange={n => setField("netAmount", n)}
                  className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/30"
                />
              )}
            </label>
          </div>

          <label className="text-xs font-semibold text-crm-text-secondary block">
            Description
            <input
              value={value.description}
              onChange={e => setField("description", e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-crm-border px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/30"
            />
          </label>

          <div>
            <p className="text-xs font-bold text-crm-text-secondary mb-2">Bank Dr / Cr</p>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {bankHeads.map((bank, bi) => {
                const b = value.bankAmounts?.[bank] ?? { debit: 0, credit: 0 };
                return (
                  <div key={bank} className="rounded-xl border border-crm-border-subtle bg-[#F8FAFC] p-2.5">
                    <p className="text-[11px] font-bold mb-1.5" style={{ color: bankColor(bi) }}>{bank}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] font-semibold text-crm-text-muted">
                        Debit
                        <AmountInput
                          value={Number(b.debit) || 0}
                          onChange={n => setBank(bank, "debit", n)}
                          className="mt-0.5 h-8 w-full rounded-lg border border-crm-border px-2 text-xs text-right"
                        />
                      </label>
                      <label className="text-[10px] font-semibold text-crm-text-muted">
                        Credit
                        <AmountInput
                          value={Number(b.credit) || 0}
                          onChange={n => setBank(bank, "credit", n)}
                          className="mt-0.5 h-8 w-full rounded-lg border border-crm-border px-2 text-xs text-right"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-crm-text-muted mt-2 font-semibold">
              Net preview: {currency(net)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-crm-text-secondary inline-flex items-center gap-1.5">
                <StickyNote size={13} className="text-amber-500" /> Notes (by date)
              </p>
              <button
                type="button"
                onClick={() => setNotes([{ id: newRowId("n"), text: "", date: todayIso() }, ...notes])}
                className="text-[11px] font-bold text-amber-700 inline-flex items-center gap-1"
              >
                <Plus size={12} /> Add note
              </button>
            </div>
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {sortedNotes.length === 0 ? (
                <p className="text-[11px] text-crm-text-faint py-3 text-center border border-dashed border-amber-200 rounded-xl bg-amber-50/40">
                  No notes yet.
                </p>
              ) : (
                sortedNotes.map(n => (
                  <div key={n.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={n.date}
                        onChange={e => setNotes(notes.map(x => (x.id === n.id ? { ...x, date: e.target.value } : x)))}
                        className="h-8 rounded-lg border border-amber-200/80 bg-white px-2 text-[11px] text-amber-950 dark:text-amber-950 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setNotes(notes.filter(x => x.id !== n.id))}
                        className="text-red-500 w-7 h-7 flex items-center justify-center"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <NoteComposer
                      value={n.text}
                      onChange={(text) =>
                        setNotes(
                          [...notes.map(x => (x.id === n.id ? { ...x, text, date: todayIso() } : x))].sort(
                            (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
                          ),
                        )
                      }
                      placeholder="Write note… (Ctrl+B / I / U)"
                      rows={2}
                      className="!border-amber-200"
                    />
                  </div>
                ))
              )}
            </div>
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
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-xs font-bold bg-[#1B6FE8] text-white hover:bg-[#9a0e26]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
