"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const PILL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PILL_MS = 500;

const PILL_TRANSITION = [
  `transform ${PILL_MS}ms ${PILL_EASE}`,
  `width ${PILL_MS}ms ${PILL_EASE}`,
  `height ${PILL_MS}ms ${PILL_EASE}`,
  `opacity 220ms ease`,
].join(", ");

type PillRect = { left: number; top: number; width: number; height: number };

/** Darker companion of the accent so the pill keeps depth on both light and dark tracks. */
export function shadeAccent(hex: string, factor: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * factor);
  const g = clamp(((n >> 8) & 255) * factor);
  const b = clamp((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

type UseSlidingPillOptions = {
  accent?: string;
  /** Keep the active chip inside view when the track scrolls horizontally. */
  autoScroll?: boolean;
  /** Extra values that should trigger a re-measure (item count, labels, …). */
  remeasureKey?: string | number;
};

/**
 * Measures the active chip and returns inline styles for a pill that slides behind it.
 * The pill snaps (no transition) on first paint, resize and font swaps so it never
 * animates in from the corner.
 */
export function useSlidingPill<T extends HTMLElement>(
  activeIndex: number,
  { accent = "#1B6FE8", autoScroll = true, remeasureKey }: UseSlidingPillOptions = {},
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(T | null)[]>([]);
  const [pill, setPill] = useState<PillRect & { ready: boolean; animate: boolean }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
    animate: false,
  });

  const registerChip = useCallback(
    (i: number) => (el: T | null) => {
      chipRefs.current[i] = el;
    },
    [],
  );

  const measure = useCallback((i: number, animate = true) => {
    const el = chipRefs.current[i];
    if (!el) return;
    const next: PillRect = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    setPill(prev => {
      if (
        prev.ready &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return { ...next, ready: true, animate: animate && prev.ready };
    });
  }, []);

  useLayoutEffect(() => {
    measure(activeIndex);
    const id = requestAnimationFrame(() => measure(activeIndex));
    return () => cancelAnimationFrame(id);
  }, [measure, activeIndex, remeasureKey]);

  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    let cancelled = false;
    void fonts.ready.then(() => {
      if (!cancelled) measure(activeIndex, false);
    });
    return () => {
      cancelled = true;
    };
  }, [measure, activeIndex]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const remeasure = () => measure(activeIndex, false);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : null;
    ro?.observe(track);
    chipRefs.current.forEach(el => {
      if (el) ro?.observe(el);
    });
    window.addEventListener("resize", remeasure);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [measure, activeIndex, remeasureKey]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = chipRefs.current[activeIndex];
    const scroller = scrollRef.current;
    if (!el || !scroller) return;

    const timer = window.setTimeout(() => {
      const elLeft = el.offsetLeft;
      const elRight = elLeft + el.offsetWidth;
      const viewLeft = scroller.scrollLeft;
      const viewRight = viewLeft + scroller.clientWidth;
      if (elLeft < viewLeft + 8 || elRight > viewRight - 8) {
        scroller.scrollTo({
          left: elLeft - scroller.clientWidth / 2 + el.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeIndex, autoScroll]);

  const pillStyle: CSSProperties = {
    width: pill.width,
    height: pill.height,
    transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
    opacity: pill.ready ? 1 : 0,
    transition: pill.animate ? PILL_TRANSITION : "opacity 160ms ease",
    background: `linear-gradient(135deg, ${accent}, ${shadeAccent(accent, 0.78)})`,
    boxShadow: `0 4px 16px ${accent}4d, inset 0 1px 0 rgba(255,255,255,0.28)`,
  };

  return { scrollRef, trackRef, registerChip, pillStyle };
}
