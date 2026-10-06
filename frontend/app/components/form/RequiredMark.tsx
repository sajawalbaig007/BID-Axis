"use client";

import type { ReactNode } from "react";

/** Brand-red asterisk for mandatory fields */
export default function RequiredMark() {
  return (
    <span className="text-[#1B6FE8] font-semibold ml-0.5" aria-hidden="true">
      *
    </span>
  );
}

export function ReqLabel({
  children,
  required,
  className = "text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 sm:mb-2 block",
}: {
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={className}>
      {children}
      {required && <RequiredMark />}
    </label>
  );
}
