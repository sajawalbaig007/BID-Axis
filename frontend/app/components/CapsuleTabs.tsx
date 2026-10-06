"use client";

import type { LucideIcon } from "lucide-react";
import { useSlidingPill } from "./useSlidingPill";

export type CapsuleTabItem<K extends string = string> = {
  key: K;
  label: string;
  icon?: LucideIcon;
  count?: number;
  /** Hidden on small screens when a shorter label reads better. */
  shortLabel?: string;
};

type CapsuleTabsProps<K extends string> = {
  tabs: CapsuleTabItem<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  accent?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Stretch chips across the full track so leftover empty space is gone. */
  stretch?: boolean;
};

const SIZES = {
  sm: { chip: "h-8 px-2.5 text-[11px] gap-1.5", icon: 13, badge: "text-[9px] px-1.5 min-w-[18px] h-4" },
  md: { chip: "h-10 px-3.5 sm:px-4 text-[12px] sm:text-[13px] gap-2", icon: 15, badge: "text-[10px] px-2 min-w-[22px] h-[18px]" },
  lg: { chip: "h-11 sm:h-12 px-4 sm:px-5 text-[13px] sm:text-sm gap-2", icon: 16, badge: "text-[11px] px-2 min-w-[24px] h-5" },
} as const;

/**
 * State-driven sibling of CapsuleChipNav — same sliding pill, but for filter/status
 * tabs that switch local state instead of navigating.
 */
export default function CapsuleTabs<K extends string>({
  tabs,
  activeKey,
  onChange,
  accent = "#1B6FE8",
  size = "md",
  className = "",
  stretch = false,
}: CapsuleTabsProps<K>) {
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === activeKey));
  const s = SIZES[size];

  const { scrollRef, trackRef, registerChip, pillStyle } = useSlidingPill<HTMLButtonElement>(
    activeIndex,
    { accent, remeasureKey: tabs.map(t => `${t.key}:${t.count ?? ""}`).join("|") },
  );

  return (
    <div
      ref={scrollRef}
      className={`w-full max-w-full overflow-x-auto accounts-nav-scroll ${className}`}
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <div
        ref={trackRef}
        className={`relative items-center gap-1 p-1 rounded-full bg-crm-nav-pill border border-crm-border shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:bg-crm-surface-raised dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
          stretch ? "flex w-full" : "inline-flex w-max"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-full border border-white/20 will-change-[transform,width,height]"
          style={pillStyle}
        />
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const active = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              ref={registerChip(i)}
              onClick={() => onChange(tab.key)}
              title={tab.label}
              className={`relative z-[1] inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap transition-colors duration-300 ${stretch ? "flex-1 min-w-0" : "shrink-0"} ${s.chip} ${
                active
                  ? "text-white"
                  : "text-crm-text-muted hover:text-crm-text hover:bg-crm-surface/60 dark:hover:bg-white/5"
              }`}
            >
              {Icon && <Icon size={s.icon} className="shrink-0" />}
              {tab.shortLabel ? (
                <>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : (
                <span>{tab.label}</span>
              )}
              {tab.count != null && (
                <span
                  className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums ${s.badge} ${
                    active ? "bg-white/25 text-white" : "bg-crm-surface text-crm-text-muted"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
