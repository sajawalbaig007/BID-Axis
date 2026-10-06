"use client";

import { Plus, Trash2 } from "lucide-react";
import type { SubHeadEntry } from "../types";
import { currency, sumSubHeads } from "../types";
import {
  BEM_INVENTORY_CATEGORIES,
  type BemInventoryCategory,
  emptyInventoryLine,
  matchInventoryCategory,
  patchInventoryLine,
} from "../utils/bemAssetInventorySeed";
import AmountInput from "./AmountInput";

type BemAssetInventoryEditorProps = {
  subHeads: SubHeadEntry[];
  onChange: (next: SubHeadEntry[]) => void;
  /** When editing a single head (IT / Electrical / Furniture), lock to that category. */
  lockedCategory?: BemInventoryCategory | null;
  /** Head title — used to infer locked category when not passed. */
  headTitle?: string;
  /** One qty × unit-price table (no IT / Electrical / Furniture groups). */
  flatMode?: boolean;
};

export default function BemAssetInventoryEditor({
  subHeads,
  onChange,
  lockedCategory,
  headTitle,
  flatMode = false,
}: BemAssetInventoryEditorProps) {
  const inferred = flatMode
    ? null
    : lockedCategory ?? (headTitle ? matchInventoryCategory(headTitle) : null);
  const categories = flatMode
    ? (["IT Inventory"] as BemInventoryCategory[])
    : inferred
      ? [inferred]
      : [...BEM_INVENTORY_CATEGORIES];

  const updateOne = (id: string, patch: Partial<SubHeadEntry>) => {
    onChange(subHeads.map(s => (s.id === id ? patchInventoryLine(s, patch) : s)));
  };

  const removeOne = (id: string) => {
    onChange(subHeads.filter(s => s.id !== id));
  };

  const addOne = (category: BemInventoryCategory) => {
    onChange([...subHeads, emptyInventoryLine(category)]);
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-crm-text-muted font-medium">
        TOTAL PRICE = QTY × Unit price · Add, edit, or delete lines.
      </p>
      {categories.map(cat => {
        const rows = flatMode || inferred
          ? subHeads
          : subHeads.filter(s => (s.inventoryCategory || "IT Inventory") === cat);
        const subtotal = sumSubHeads(rows);
        return (
          <div key={cat} className="rounded-xl border border-crm-border overflow-hidden bg-crm-surface">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#0F766E]/10 border-b border-crm-border-subtle">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#0F766E]">
                {flatMode ? "Line items" : cat}
              </p>
              <button
                type="button"
                onClick={() => addOne(cat)}
                className="text-[11px] font-bold text-[#0B84F3] inline-flex items-center gap-1 hover:underline"
              >
                <Plus size={12} /> Add item
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="border-b bg-crm-muted text-crm-text-faint">
                    <th className="w-10 px-2 py-2 text-left font-bold uppercase tracking-wide text-[9px]">SR#</th>
                    <th className="px-2 py-2 text-left font-bold uppercase tracking-wide text-[9px]">Description</th>
                    <th className="w-20 px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Qty</th>
                    <th className="w-28 px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Unit price</th>
                    <th className="w-28 px-2 py-2 text-right font-bold uppercase tracking-wide text-[9px]">Total price</th>
                    <th className="w-10 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-crm-text-faint text-[11px]">
                        No items — click Add item.
                      </td>
                    </tr>
                  ) : (
                    rows.map((s, i) => {
                      const total = patchInventoryLine(s, {}).amount;
                      return (
                        <tr key={s.id} className="border-b border-crm-border-subtle last:border-0">
                          <td className="px-2 py-1.5 text-crm-text-faint tabular-nums">{i + 1}</td>
                          <td className="px-2 py-1.5">
                            <input
                              value={s.label}
                              onChange={e => updateOne(s.id, { label: e.target.value, inventoryCategory: cat })}
                              className="h-8 w-full rounded-lg border border-crm-border px-2 text-xs bg-crm-surface outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                              placeholder="Description"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <AmountInput
                              value={Number(s.qty) || 0}
                              onChange={n => updateOne(s.id, { qty: n, inventoryCategory: cat })}
                              className="h-8 w-full rounded-lg border border-crm-border px-2 text-xs text-right bg-crm-surface outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <AmountInput
                              value={Number(s.unitPrice) || 0}
                              onChange={n => updateOne(s.id, { unitPrice: n, inventoryCategory: cat })}
                              className="h-8 w-full rounded-lg border border-crm-border px-2 text-xs text-right bg-crm-surface outline-none focus:ring-2 focus:ring-[#0D9488]/30"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-bold tabular-nums text-[#1B6FE8] whitespace-nowrap">
                            {currency(total)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeOne(s.id)}
                              className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                              title="Delete item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-teal-100 bg-teal-50/50">
                    <td colSpan={4} className="px-2 py-2 text-[10px] font-extrabold uppercase tracking-wide text-teal-900">
                      Subtotal
                    </td>
                    <td className="px-2 py-2 text-right font-black tabular-nums text-[#1B6FE8] text-sm">
                      {currency(subtotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
      {!inferred && !flatMode && (
        <p className="text-right text-sm font-extrabold text-crm-text">
          Total Amount: {currency(sumSubHeads(subHeads))}
        </p>
      )}
    </div>
  );
}
