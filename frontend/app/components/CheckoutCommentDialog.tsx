"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function CheckoutCommentDialog({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  if (!open) return null;
  return <CheckoutCommentForm busy={busy} onCancel={onCancel} onConfirm={onConfirm} />;
}

function CheckoutCommentForm({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  return (
    <div className="fixed inset-0 z-[90] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">Check out</h2>
            <p className="text-[11px] text-gray-500">Add an overtime comment if these hours need approval.</p>
          </div>
          <button type="button" onClick={onCancel} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center" aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Overtime comment
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Mention the hours, for example 2 hours overtime"
              className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-[#F8FAFC] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#0B1220] outline-none focus:border-[#1B6FE8]/40"
              style={{ color: "#0B1220" }}
            />
          </label>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(comment.trim())}
            className="flex-1 h-11 rounded-xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : "Check out"}
          </button>
        </div>
      </div>
    </div>
  );
}
