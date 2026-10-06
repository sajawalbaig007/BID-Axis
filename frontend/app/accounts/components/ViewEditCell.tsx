"use client";

import { useState } from "react";
import { Eye, Check, Pencil } from "lucide-react";
import { currency } from "../types";
import AmountInput from "./AmountInput";

type ViewEditCellProps = {
  value: string | number;
  type?: "text" | "number" | "date";
  align?: "left" | "right" | "center";
  inputClass?: string;
  formatDisplay?: (v: string | number) => string;
  onChange: (v: string | number) => void;
  /** Start in edit mode */
  defaultEditing?: boolean;
  compact?: boolean;
};

export default function ViewEditCell({
  value,
  type = "text",
  align = "left",
  inputClass = "",
  formatDisplay,
  onChange,
  defaultEditing = false,
  compact = false,
}: ViewEditCellProps) {
  const [editing, setEditing] = useState(defaultEditing);
  const alignCls = align === "right" ? "text-right justify-end" : align === "center" ? "text-center justify-center" : "text-left";

  const display =
    formatDisplay?.(value) ??
    (type === "number" ? currency(Number(value) || 0) : String(value ?? "—"));

  if (editing) {
    return (
      <div className={`flex items-center gap-1 ${alignCls}`}>
        {type === "number" ? (
          <AmountInput
            value={Number(value) || 0}
            onChange={n => onChange(n)}
            className={`${compact ? "h-8 text-xs" : "h-9 text-sm"} flex-1 min-w-0 rounded-lg border border-crm-border bg-crm-surface px-2 outline-none focus:ring-2 ${inputClass}`}
            autoFocus
          />
        ) : (
          <input
            type={type}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={e => onChange(e.target.value)}
            className={`${compact ? "h-8 text-xs" : "h-9 text-sm"} flex-1 min-w-0 rounded-lg border border-crm-border bg-crm-surface px-2 outline-none focus:ring-2 ${inputClass}`}
            autoFocus
          />
        )}
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="w-7 h-7 shrink-0 rounded-lg bg-[#ECFDF3] text-[#12B76A] flex items-center justify-center hover:bg-[#D1FAE5]"
          title="Done"
        >
          <Check size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1.5 min-w-0 ${alignCls}`}>
      <span className={`truncate ${compact ? "text-xs" : "text-sm"} text-crm-text font-medium`}>
        {display || "—"}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-7 h-7 shrink-0 rounded-lg bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center opacity-70 group-hover:opacity-100 hover:bg-[#D6EBFF] transition-opacity"
        title="Edit"
      >
        <Eye size={13} />
      </button>
    </div>
  );
}

/** Row-level edit toggle with pencil */
export function RowEditToggle({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
        editing
          ? "bg-[#12B76A] text-white shadow-sm"
          : "bg-[#F5F6FA] text-[#0B84F3] hover:bg-[#EAF5FF]"
      }`}
      title={editing ? "Done editing row" : "Edit row"}
    >
      {editing ? <Check size={14} /> : <Pencil size={14} />}
    </button>
  );
}
