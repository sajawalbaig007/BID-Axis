"use client";

import { X } from "lucide-react";

type ProofImagePreviewProps = {
  open: boolean;
  url: string;
  title?: string;
  onClose: () => void;
};

export default function ProofImagePreview({ open, url, title, onClose }: ProofImagePreviewProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[min(96vw,920px)] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-2 px-1">
          <p className="text-white text-sm font-semibold truncate">{title || "Proof preview"}</p>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 text-white hover:bg-white/20 inline-flex items-center justify-center shrink-0"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>
        <div className="rounded-2xl overflow-hidden bg-crm-surface shadow-2xl border border-white/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={title || "Uploaded proof"}
            className="max-h-[calc(90vh-3rem)] w-auto max-w-full object-contain mx-auto block"
          />
        </div>
      </div>
    </div>
  );
}
