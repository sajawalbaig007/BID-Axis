"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Star } from "lucide-react";
import {
  ESTIMATOR_KPI_FIELD_META,
  toDatetimeLocalValue,
  type EstimatorKpiFieldKey,
  type EstimatorKpiRecord,
} from "@/lib/estimatorKpiRecords";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  fieldKey: EstimatorKpiFieldKey;
  estimatorName: string;
  initial?: EstimatorKpiRecord | null;
  draftValue?: string;
  draftNote?: string;
  liveHoursHint?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: { value: string; note: string; recordedAt: string }) => void;
};

export default function EstimatorKpiEntryModal({
  open,
  mode,
  fieldKey,
  estimatorName,
  initial,
  draftValue,
  draftNote,
  liveHoursHint,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const meta = ESTIMATOR_KPI_FIELD_META[fieldKey] ?? {
    label: String(fieldKey).replace(/_/g, " "),
    input: "text" as const,
  };
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [recordedAt, setRecordedAt] = useState(toDatetimeLocalValue(new Date()));

  useEffect(() => {
    if (!open) return;
    const fallback =
      meta.input === "stars5" ? "5" : meta.input === "marks10" ? "10" : "";
    setValue(initial?.value ?? draftValue ?? fallback);
    setNote(initial?.note ?? draftNote ?? "");
    setRecordedAt(toDatetimeLocalValue(initial?.recordedAt ?? new Date()));
  }, [open, initial, draftValue, draftNote, meta.input]);

  if (!open) return null;

  const stars = Math.max(1, Math.min(5, Math.round(Number(value) || 0)));

  const body = (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#1B6FE8]">
              {mode === "create" ? "Add entry" : "Edit entry"}
            </p>
            <h3 className="font-bold text-[#0F172A] text-sm sm:text-base truncate">{meta.label}</h3>
            <p className="text-[11px] text-gray-500 truncate">{estimatorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 inline-flex items-center justify-center hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              value: value.trim(),
              note: note.trim(),
              recordedAt: new Date(recordedAt).toISOString(),
            });
          }}
        >
          {fieldKey === "productivity" && liveHoursHint ? (
            <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
              Live time track reference: <strong>{liveHoursHint}</strong>
            </p>
          ) : null}

          {meta.hint ? <p className="text-[11px] text-gray-500">{meta.hint}</p> : null}

          {meta.input === "stars5" ? (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Rating</label>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setValue(String(n))}
                    className="p-1"
                    aria-label={`${n} stars`}
                  >
                    <Star
                      size={26}
                      className={n <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}
                    />
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold text-gray-700 tabular-nums">{stars}/5</span>
              </div>
            </div>
          ) : meta.input === "textarea" ? (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Value</label>
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
                required
                className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#1B6FE8] bg-[#FAFAFA]"
              />
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                {meta.input === "marks10" ? "Marks (0–10)" : "Value"}
              </label>
              <input
                type={meta.input === "number" || meta.input === "marks10" ? "number" : "text"}
                min={meta.input === "marks10" ? 0 : meta.input === "number" ? 0 : undefined}
                max={meta.input === "marks10" ? 10 : undefined}
                step={meta.input === "marks10" ? 0.5 : meta.input === "number" ? 1 : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="mt-1.5 w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-[#0F172A] outline-none focus:border-[#1B6FE8] bg-[#FAFAFA]"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              Timestamp (for monthly report)
            </label>
            <input
              type="datetime-local"
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
              required
              className="mt-1.5 w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-[#0F172A] outline-none focus:border-[#1B6FE8] bg-[#FAFAFA]"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Context for this entry…"
              className="mt-1.5 w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-[#0F172A] outline-none focus:border-[#1B6FE8] bg-[#FAFAFA] placeholder:text-gray-400"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !value.trim()}
              className="flex-1 h-11 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold hover:bg-[#a30f27] disabled:opacity-60"
            >
              {saving ? "Saving…" : mode === "create" ? "Add entry" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
