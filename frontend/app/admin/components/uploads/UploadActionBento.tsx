"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import CapsuleTabs from "@/app/components/CapsuleTabs";

export type UploadBentoItem = {
  id: string;
  label: string;
  shortLabel?: string;
  accent: string;
  span?: "hero" | "wide" | "normal";
  content: ReactNode;
};

type Props = {
  items: UploadBentoItem[];
  className?: string;
  title?: string;
  subtitle?: string;
  replayLabel?: string;
  toolbar?: ReactNode;
};

const DECK_OFFSETS = [
  { x: 0, y: 0, r: 0, z: 50 },
  { x: -32, y: -20, r: -10, z: 40 },
  { x: 34, y: -18, r: 11, z: 40 },
  { x: -30, y: 26, r: -8, z: 30 },
  { x: 32, y: 28, r: 9, z: 30 },
];

const COL_SPAN: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};

const COL_START: Record<number, string> = {
  1: "md:col-start-1",
  2: "md:col-start-2",
  3: "md:col-start-3",
  4: "md:col-start-4",
  5: "md:col-start-5",
  6: "md:col-start-6",
  7: "md:col-start-7",
  8: "md:col-start-8",
  9: "md:col-start-9",
  10: "md:col-start-10",
  11: "md:col-start-11",
  12: "md:col-start-12",
};

const ROW_START: Record<number, string> = {
  1: "md:row-start-1",
  2: "md:row-start-2",
  3: "md:row-start-3",
  4: "md:row-start-4",
  5: "md:row-start-5",
  6: "md:row-start-6",
  7: "md:row-start-7",
  8: "md:row-start-8",
};

/** Spans for `count` cards in one 12-col row — last card absorbs leftover so the row is always full. */
function packRow(count: number): number[] {
  const n = Math.max(1, count);
  const base = Math.floor(12 / n);
  const rem = 12 - base * n;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? base + rem : base));
}

/**
 * How many cards to place on this bottom row so leftover cells never sit empty.
 * Avoid a lonely last card when 4 remain (2+2 instead of 3+1).
 */
function takeForRow(remaining: number): number {
  if (remaining <= 3) return remaining;
  if (remaining === 4) return 2;
  return 3;
}

/** Focused card is the tall left tile; every other row stretches so no empty cells remain. */
function buildSlotMap(ids: string[], focusId: string): Record<string, string> {
  const out: Record<string, string> = {};
  const others = ids.filter((id) => id !== focusId);
  const n = others.length;
  const smFillLast = (id: string) =>
    ids.length % 2 === 1 && id === ids[ids.length - 1] ? " sm:col-span-2" : "";

  if (n === 0) {
    out[focusId] = `${COL_SPAN[12]} ${ROW_START[1]} sm:col-span-2`;
    return out;
  }

  out[focusId] = `${COL_SPAN[8]} md:row-span-2 ${COL_START[1]} ${ROW_START[1]} sm:col-span-2`;

  if (n === 1) {
    out[others[0]] = `${COL_SPAN[4]} ${COL_START[9]} ${ROW_START[1]} md:row-span-2${smFillLast(others[0])}`;
    return out;
  }

  out[others[0]] = `${COL_SPAN[4]} ${COL_START[9]} ${ROW_START[1]}${smFillLast(others[0])}`;
  out[others[1]] = `${COL_SPAN[4]} ${COL_START[9]} ${ROW_START[2]}${smFillLast(others[1])}`;

  const bottom = others.slice(2);
  let i = 0;
  let row = 3;
  while (i < bottom.length) {
    const take = takeForRow(bottom.length - i);
    const spans = packRow(take);
    let col = 1;
    for (let j = 0; j < take; j++) {
      const id = bottom[i + j];
      const span = spans[j] ?? 12;
      out[id] = `${COL_SPAN[span]} ${COL_START[col]} ${ROW_START[row] ?? ""}${smFillLast(id)}`;
      col += span;
    }
    i += take;
    row += 1;
  }

  return out;
}

export default function UploadActionBento({
  items,
  className = "",
  title = "Upload board",
  subtitle = "Deck expands into a bento board — tap a capsule or card to focus.",
  replayLabel = "Replay expand",
  toolbar,
}: Props) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const [order, setOrder] = useState(ids);
  const [expanded, setExpanded] = useState(false);
  const [focusId, setFocusId] = useState(ids[0] ?? "");

  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    });
    if (!focusId || !ids.includes(focusId)) setFocusId(ids[0] ?? "");
  }, [ids, focusId]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setExpanded(true), 520);
    return () => window.clearTimeout(t1);
  }, []);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const activeItem = byId.get(focusId);
  const slotMap = useMemo(() => buildSlotMap(ids, focusId), [ids, focusId]);

  const select = useCallback((id: string) => {
    setFocusId(id);
    setOrder((prev) => (prev[0] === id ? prev : [id, ...prev.filter((x) => x !== id)]));
    setExpanded(false);
    window.setTimeout(() => setExpanded(true), 300);
  }, []);

  const replayIntro = useCallback(() => {
    setExpanded(false);
    window.setTimeout(() => setExpanded(true), 450);
  }, []);

  /* Deck uses shuffle order; expanded grid uses stable focus layout */
  const renderIds = expanded ? ids : order;

  return (
    <div className={`space-y-4 antialiased ${className}`}>
      {/* Title + capsule LEFT */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-crm-text tracking-tight">{title}</h2>
            {subtitle ? <p className="text-sm text-gray-500 dark:text-crm-text-muted mt-1">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {toolbar}
            <button
              type="button"
              onClick={replayIntro}
              className="self-start h-10 px-4 rounded-full text-sm font-semibold border border-gray-200 dark:border-crm-border bg-white dark:bg-crm-surface text-gray-700 dark:text-crm-text-secondary hover:bg-gray-50 dark:hover:bg-crm-muted shadow-sm shrink-0"
            >
              {replayLabel}
            </button>
          </div>
        </div>

        {focusId ? (
          <div className="w-full max-w-full">
            <CapsuleTabs
              size="lg"
              activeKey={focusId}
              onChange={(key) => select(key)}
              accent={activeItem?.accent ?? "#1B6FE8"}
              className="!max-w-none"
              tabs={items.map((i) => ({
                key: i.id,
                label: i.label,
                shortLabel: i.shortLabel ?? i.label,
              }))}
            />
          </div>
        ) : null}
      </div>

      <div
        className={`relative w-full rounded-[2rem] transition-[min-height,background] duration-500 ${
          expanded ? "min-h-0 bg-transparent" : "min-h-[400px] sm:min-h-[440px]"
        }`}
        style={
          expanded
            ? undefined
            : {
                background:
                  "radial-gradient(ellipse at 50% 45%, rgba(184,17,45,0.1), transparent 55%), linear-gradient(145deg, #f1f5f9 0%, #eef2ff 50%, #fdf2f8 100%)",
              }
        }
      >
        <div
          className={
            expanded
              ? "relative grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 md:grid-rows-[minmax(300px,auto)_minmax(260px,auto)] md:auto-rows-[minmax(240px,auto)] gap-3 sm:gap-4"
              : "absolute inset-0"
          }
        >
          {renderIds.map((id, index) => {
            const item = byId.get(id);
            if (!item) return null;
            const focused = expanded && id === focusId;
            const deck = DECK_OFFSETS[Math.min(index, DECK_OFFSETS.length - 1)];
            const orderIndex = order.indexOf(id);

            return (
              <div
                key={id}
                className={`
                  group/card rounded-[1.75rem] border bg-white dark:bg-crm-surface overflow-hidden
                  transition-[transform,box-shadow,border-color,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                  flex flex-col
                  ${expanded ? `${slotMap[id] ?? COL_SPAN[12]} h-full min-h-[300px]` : "absolute left-1/2 top-1/2 w-[min(92%,390px)]"}
                  ${focused ? "shadow-2xl" : "shadow-md hover:shadow-xl"}
                `}
                style={{
                  zIndex: expanded ? (focused ? 20 : 10) : deck.z,
                  borderColor: focused || !expanded ? `${item.accent}66` : "var(--crm-border)",
                  boxShadow: focused
                    ? `0 24px 48px -28px ${item.accent}aa, 0 0 0 2px ${item.accent}33`
                    : !expanded
                      ? `0 20px 40px -24px rgba(15,23,42,0.35)`
                      : undefined,
                  transform: expanded
                    ? "none"
                    : `translate(calc(-50% + ${deck.x}px), calc(-50% + ${deck.y}px)) rotate(${deck.r}deg) scale(${orderIndex === 0 ? 1 : 0.88})`,
                }}
              >
                <button
                  type="button"
                  aria-label={`Focus ${item.label}`}
                  onClick={() => {
                    if (id !== focusId || !expanded) select(id);
                  }}
                  className="shrink-0 w-full h-11 relative z-20 cursor-pointer text-left px-4"
                  style={{ background: `linear-gradient(90deg, ${item.accent}, ${item.accent}66)` }}
                >
                  <span className="text-sm font-bold text-white tracking-wide">
                    {item.label}
                    {focused ? " · focused" : ""}
                  </span>
                </button>

                <div className="flex-1 min-h-[240px] overflow-y-auto overflow-x-hidden flex flex-col">
                  {item.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
