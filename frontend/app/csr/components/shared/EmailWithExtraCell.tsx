"use client";

import { createPortal } from "react-dom";
import { parseEmails } from "../../utils/parseEmails";
import { useFixedPopover } from "../../hooks/useFixedPopover";
import { useOpenCrmMail } from "@/app/components/mail/CrmMailProvider";

interface EmailWithExtraCellProps {
  email: string;
  /** All emails — enables +N click popup */
  allEmails?: string[];
  variant?: "plain" | "pill";
  className?: string;
  emptyLabel?: string;
  clientName?: string;
  company?: string;
}

/** Email + optional +N popup (same pattern as phone). Click opens company-mail composer. */
export default function EmailWithExtraCell({
  email,
  allEmails,
  variant = "plain",
  className = "",
  emptyLabel = "—",
  clientName,
  company,
}: EmailWithExtraCellProps) {
  const openCompose = useOpenCrmMail();
  const emails =
    allEmails && allEmails.length > 0
      ? allEmails
      : parseEmails(email);
  const primary = emails[0] ?? "";
  const extras = emails.length > 1 ? emails.length - 1 : 0;

  const { open, toggle, setOpen, anchorRef, panelRef, style } = useFixedPopover(300, 160);

  const compose = (to: string) => {
    if (!to || !openCompose) return;
    openCompose({ to, toOptions: emails, clientName, company });
  };

  if (!primary) {
    return <span className={`text-gray-300 text-xs ${className}`}>{emptyLabel}</span>;
  }

  const chip = (
    <>
      <span className={extras > 0 ? "truncate min-w-0 max-w-[100px] sm:max-w-[130px]" : "truncate min-w-0"}>
        {primary}
      </span>
      {extras > 0 && (
        <span className="bg-[#1B6FE8] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
          +{extras}
        </span>
      )}
    </>
  );

  const shellClass =
    variant === "pill"
      ? `inline-flex items-center gap-1 flex-nowrap bg-[#F0F7FF] text-[#0B84F3] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium min-w-0 max-w-full overflow-visible ${className}`
      : `inline-flex items-center gap-1 flex-nowrap min-w-0 max-w-full overflow-visible text-xs sm:text-sm text-[#0B84F3] ${className}`;

  if (!openCompose) {
    return <span className={shellClass} title={primary}>{chip}</span>;
  }

  const popup =
    open &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="bg-white border border-gray-100 rounded-xl shadow-xl py-1.5 min-w-[220px] max-w-[300px]"
        onClick={e => e.stopPropagation()}
      >
        {emails.map((em, idx) => (
          <button
            key={`${em}-${idx}`}
            type="button"
            onClick={() => {
              setOpen(false);
              compose(em);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#0B84F3] font-medium hover:bg-[#F0F7FF] text-left"
          >
            <span className="text-gray-300 text-[10px] shrink-0">{idx + 1}.</span>
            <span className="truncate">{em}</span>
          </button>
        ))}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={e => {
          e.stopPropagation();
          if (extras > 0) toggle();
          else compose(primary);
        }}
        className={`${shellClass} cursor-pointer hover:underline hover:opacity-90 transition-opacity`}
        title="Send email"
        aria-expanded={open}
      >
        {chip}
      </button>
      {typeof document !== "undefined" && popup}
    </>
  );
}
