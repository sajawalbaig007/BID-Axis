"use client";

import type { ReactNode } from "react";
import { BENTO_CARD } from "@/lib/staffPageLayout";

type AccountsChartCardProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: string;
  children: ReactNode;
  className?: string;
};

/** Soft chart shell used across Accounts pages. */
export default function AccountsChartCard({
  title,
  subtitle,
  icon,
  accent = "#1B6FE8",
  children,
  className = "",
}: AccountsChartCardProps) {
  return (
    <div
      className={`relative overflow-hidden flex flex-col min-w-0 ${BENTO_CARD} ${className}`}
    >
      <div
        className="absolute inset-x-0 top-0 h-1 opacity-90"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}55, transparent)` }}
      />
      <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full opacity-[0.07] dark:opacity-[0.12]" style={{ background: accent }} />
      <div className="relative px-4 sm:px-5 pt-4 pb-2 flex items-start gap-2.5 shrink-0">
        {icon && (
          <span
            className="w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0"
            style={{ background: `${accent}14`, color: accent }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-extrabold text-crm-text text-sm tracking-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-crm-text-faint mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      <div className="relative px-2 sm:px-3 pb-4 flex-1 min-h-0">{children}</div>
    </div>
  );
}

export const CHART_COLORS = [
  "#1B6FE8", // brand red
  "#0B84F3", // blue
  "#12B76A", // green
  "#F59E0B", // amber
  "#0D9488", // teal
  "#EA580C", // orange
  "#0284C7", // sky
  "#475569", // slate
];
