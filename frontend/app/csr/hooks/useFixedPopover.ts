"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useFixedPopover(
  panelWidth = 260,
  panelHeight = 180,
  align: "start" | "end" = "start",
) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ zIndex: 9999 });

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const preferredLeft = align === "end" ? rect.right - panelWidth : rect.left;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - panelWidth - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < panelHeight && rect.top > panelHeight) {
      setStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 6,
        left,
        width: panelWidth,
        zIndex: 9999,
      });
    } else {
      setStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left,
        width: panelWidth,
        zIndex: 9999,
      });
    }
  }, [panelWidth, panelHeight, align]);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  const toggle = () => setOpen(v => !v);

  return { open, setOpen, toggle, anchorRef, panelRef, style };
}
