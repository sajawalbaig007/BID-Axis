"use client";

import { createPortal } from "react-dom";
import { Briefcase, Pencil } from "lucide-react";
import { parseInterestedServices } from "../../utils/parseInterestedServices";
import { useFixedPopover } from "../../hooks/useFixedPopover";

interface InterestedServicesCellProps {
  interestedService: string;
  /** Max badges shown inline before +N popup */
  inlineMax?: number;
  className?: string;
  emptyLabel?: string;
  /** When set, cell is editable — click opens scope/service editor */
  onEdit?: () => void;
}

/** One or more interested-service badges; extras collapse to +N. */
export default function InterestedServicesCell({
  interestedService,
  inlineMax = 1,
  className = "",
  emptyLabel = "—",
  onEdit,
}: InterestedServicesCellProps) {
  const services = parseInterestedServices(interestedService);

  if (services.length === 0) {
    if (onEdit) {
      return (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className={`inline-flex items-center gap-1 text-[#D97706] text-xs font-semibold hover:underline ${className}`}
          title="Edit interested scope"
        >
          <Pencil size={11} />
          Add scope
        </button>
      );
    }
    return <span className={`text-gray-300 text-xs ${className}`}>{emptyLabel}</span>;
  }

  /* Always use the +N path so multiple scopes show as first badge + +N */
  const visible = services.slice(0, Math.max(1, inlineMax));
  const hidden = services.slice(Math.max(1, inlineMax));
  const canOpen = hidden.length > 0;
  const isSingle = services.length === 1;

  const { open, toggle, anchorRef, panelRef, style } = useFixedPopover(280, 180);

  const badge = (svc: string) => (
    <span
      key={svc}
      className={`inline-flex items-center gap-1 bg-[#FFF4E5] text-[#D97706] font-semibold shrink-0 min-w-0 max-w-full ${
        isSingle
          ? "px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs sm:text-sm"
          : "px-2 py-0.5 rounded-lg text-[10px] sm:text-xs"
      }`}
      title={svc}
    >
      <Briefcase size={isSingle ? 11 : 9} className="shrink-0" />
      <span className="truncate max-w-[88px] sm:max-w-[110px]">{svc}</span>
    </span>
  );

  const popup =
    open &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="bg-white border border-gray-100 rounded-xl shadow-xl py-1.5 min-w-[200px] max-w-[280px] z-[200]"
        onClick={e => e.stopPropagation()}
      >
        {services.map((svc, idx) => (
          <div
            key={`${svc}-${idx}`}
            className="flex items-center gap-2 px-3 py-2 text-xs text-[#D97706] font-semibold hover:bg-[#FFF4E5]"
          >
            <Briefcase size={11} className="shrink-0" />
            <span className="truncate">{svc}</span>
          </div>
        ))}
      </div>,
      document.body,
    );

  const chips = (
    <div className={`flex flex-wrap items-center gap-1 min-w-0 max-w-full ${className}`}>
      {visible.map(svc => badge(svc))}
      {canOpen && (
        <span className="bg-[#D97706] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
          +{hidden.length}
        </span>
      )}
      {onEdit && <Pencil size={10} className="shrink-0 text-[#D97706] opacity-70" />}
    </div>
  );

  if (!canOpen && !onEdit) {
    return chips;
  }

  return (
    <>
      <button
        ref={onEdit ? undefined : anchorRef}
        type="button"
        onClick={e => {
          e.stopPropagation();
          if (onEdit) onEdit();
          else toggle();
        }}
        className="cursor-pointer hover:opacity-90 transition-opacity text-left"
        title={
          onEdit
            ? "Edit interested scope"
            : canOpen
              ? `Show all ${services.length} scopes`
              : services[0]
        }
        aria-expanded={onEdit ? undefined : open}
      >
        {chips}
      </button>
      {!onEdit && typeof document !== "undefined" && popup}
    </>
  );
}
