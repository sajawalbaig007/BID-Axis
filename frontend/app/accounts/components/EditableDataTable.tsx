"use client";

import { Trash2 } from "lucide-react";

export type EditableColumn = {
  key: string;
  label: string;
  type?: "text" | "number" | "date";
  align?: "left" | "right" | "center";
  width?: string;
  readOnly?: boolean;
  placeholder?: string;
};

type EditableDataTableProps<T extends { id: string }> = {
  columns: EditableColumn[];
  rows: T[];
  onChange: (id: string, key: keyof T & string, value: string | number) => void;
  onDelete?: (id: string) => void;
  minWidth?: string;
  emptyLabel?: string;
};

export default function EditableDataTable<T extends { id: string }>({
  columns,
  rows,
  onChange,
  onDelete,
  minWidth = "760px",
  emptyLabel = "No rows yet — use Add New.",
}: EditableDataTableProps<T>) {
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[520px] rounded-2xl border border-crm-border-subtle">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="bg-[#F8FAFC] sticky top-0 z-10">
          <tr className="border-b border-crm-border">
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-3 py-2.5 font-semibold text-crm-text-secondary ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                }`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
            {onDelete && <th className="w-12 px-2 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (onDelete ? 1 : 0)} className="px-3 py-10 text-center text-crm-text-faint text-sm">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={row.id} className={`border-b border-crm-border-subtle ${idx % 2 === 0 ? "bg-crm-surface" : "bg-crm-surface-muted"}`}>
                {columns.map(col => {
                  const val = row[col.key as keyof T];
                  const align = col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left";
                  if (col.readOnly) {
                    return (
                      <td key={col.key} className={`px-3 py-2 ${align} text-crm-text-secondary font-medium`}>
                        {String(val ?? "")}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className={`px-2 py-1.5 ${align}`}>
                      <input
                        type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
                        value={val === undefined || val === null ? "" : String(val)}
                        placeholder={col.placeholder}
                        onChange={e => {
                          const raw = e.target.value;
                          onChange(
                            row.id,
                            col.key as keyof T & string,
                            col.type === "number" ? Number(raw || 0) : raw,
                          );
                        }}
                        className="h-9 w-full rounded-lg border border-crm-border bg-crm-surface px-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20 focus:border-[#1B6FE8]/40"
                      />
                    </td>
                  );
                })}
                {onDelete && (
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => onDelete(row.id)}
                      className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                      title="Delete row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
