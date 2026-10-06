"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFixedPopover } from "@/app/csr/hooks/useFixedPopover";

export type ExtraProjectItem = {
  code: string;
  scope: string;
};

export default function ExtraProjectCodesPopup({
  extras,
  title = "Other projects",
}: {
  extras: ExtraProjectItem[];
  title?: string;
}) {
  const { open, toggle, setOpen, anchorRef, panelRef, style } = useFixedPopover(280, 280);

  if (extras.length === 0) return null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={e => {
          e.stopPropagation();
          toggle();
        }}
        className="inline-flex items-center bg-[#1B6FE8] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 hover:bg-[#0E4FBE] transition-colors leading-none"
        title={`${extras.length} more project${extras.length === 1 ? "" : "s"}`}
      >
        +{extras.length}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{ ...style, width: 280, maxWidth: "calc(100vw - 16px)" }}
            className="bg-white border border-gray-100 rounded-xl shadow-xl z-[200] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                {title} ({extras.length})
              </p>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            </div>
            <ul className="max-h-[240px] overflow-y-auto divide-y divide-gray-50">
              {extras.map(item => (
                <li key={item.code} className="px-3 py-2 flex items-start gap-2">
                  <span className="bg-[#1B6FE8]/10 text-[#1B6FE8] text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
                    {item.code}
                  </span>
                  <span className="text-[11px] text-gray-600 leading-snug min-w-0">
                    {item.scope || "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
