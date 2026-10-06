"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useSlidingPill } from "./useSlidingPill";

export type CapsuleChipItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  shortTitle?: string;
};

type CapsuleChipNavProps = {
  items: CapsuleChipItem[];
  baseHref: string;
  accent?: string;
  gridClassName?: string;
  className?: string;
  variant?: "inline" | "grid";
};

export default function CapsuleChipNav({
  items,
  baseHref,
  accent = "#1B6FE8",
  gridClassName = "grid-cols-3 sm:grid-cols-6",
  className = "",
  variant = "inline",
}: CapsuleChipNavProps) {
  const pathname = usePathname();
  const [optimisticIndex, setOptimisticIndex] = useState<number | null>(null);

  const routeIndex = items.findIndex(item =>
    item.href === baseHref ? pathname === baseHref : pathname.startsWith(item.href),
  );
  const resolvedRouteIndex = routeIndex >= 0 ? routeIndex : 0;
  const index = optimisticIndex ?? resolvedRouteIndex;

  useEffect(() => {
    if (optimisticIndex === null) return;
    if (optimisticIndex === resolvedRouteIndex) {
      setOptimisticIndex(null);
    }
  }, [optimisticIndex, resolvedRouteIndex]);

  const { scrollRef, trackRef, registerChip, pillStyle } = useSlidingPill<HTMLAnchorElement>(index, {
    accent,
    autoScroll: variant === "inline",
    remeasureKey: `${pathname}|${items.length}`,
  });

  const renderLink = (
    item: CapsuleChipItem,
    i: number,
    linkClass: string,
    label: ReactNode,
  ) => {
    const Icon = item.icon;
    const active = i === index;
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        ref={registerChip(i)}
        title={item.title}
        onClick={() => setOptimisticIndex(i)}
        className={`${linkClass} ${
          active
            ? "text-white"
            : "text-crm-text-muted hover:text-crm-text hover:bg-crm-surface/60 dark:hover:bg-white/5"
        }`}
      >
        <Icon size={13} className="shrink-0" />
        {label}
      </Link>
    );
  };

  if (variant === "grid") {
    return (
      <div ref={trackRef} className={`relative grid gap-1 sm:gap-1.5 ${gridClassName} ${className}`}>
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-full border border-white/20 will-change-[transform,width,height]"
          style={pillStyle}
        />
        {items.map((item, i) =>
          renderLink(
            item,
            i,
            `relative z-[1] inline-flex w-full items-center justify-center gap-1 sm:gap-1.5 h-9 px-1.5 sm:px-2 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap min-w-0 transition-colors duration-300`,
            <>
              <span className="truncate sm:hidden">{item.shortTitle ?? item.title}</span>
              <span className="truncate hidden sm:inline">{item.title}</span>
            </>,
          ),
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={`w-full max-w-full overflow-x-auto accounts-nav-scroll ${className}`}
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <div
        ref={trackRef}
        className="relative mx-auto flex w-max items-center gap-1 p-1 rounded-full bg-crm-nav-pill border border-crm-border shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:bg-crm-surface-raised dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-full border border-white/20 will-change-[transform,width,height]"
          style={pillStyle}
        />
        {items.map((item, i) => {
          const short = item.shortTitle ?? item.title.split(" ")[0];
          return renderLink(
            item,
            i,
            `relative z-[1] inline-flex items-center justify-center gap-1 h-8 sm:h-9 px-1.5 sm:px-2 xl:px-2.5 rounded-full text-[10px] sm:text-[11px] xl:text-xs font-bold whitespace-nowrap shrink-0 transition-colors duration-300 min-w-0`,
            <>
              <span className="truncate lg:hidden">{short}</span>
              <span className="truncate hidden lg:inline xl:hidden">{short}</span>
              <span className="truncate hidden xl:inline">{item.title}</span>
            </>,
          );
        })}
      </div>
    </div>
  );
}
