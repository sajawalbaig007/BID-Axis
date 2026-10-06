"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const CHAT_LIST_MIN = 200;
export const CHAT_LIST_MAX = 520;
export const CHAT_LIST_DEFAULT = 280;

export function useChatListWidth(storageKey: string, fallback = CHAT_LIST_DEFAULT) {
  const [width, setWidth] = useState(fallback);
  const widthRef = useRef(fallback);
  widthRef.current = width;

  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(n) && n >= CHAT_LIST_MIN && n <= CHAT_LIST_MAX) {
        widthRef.current = n;
        setWidth(n);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (ev: PointerEvent) => {
      const next = Math.min(CHAT_LIST_MAX, Math.max(CHAT_LIST_MIN, startW + ev.clientX - startX));
      widthRef.current = next;
      setWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(storageKey, String(widthRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [storageKey]);

  return { width, onPointerDown };
}

export default function ChatListResizeHandle({
  onPointerDown,
  className = "hidden sm:flex",
}: {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize conversation list"
      onPointerDown={onPointerDown}
      className={`${className} w-1.5 shrink-0 cursor-col-resize items-stretch relative z-10 hover:bg-[#1B6FE8]/15 active:bg-[#1B6FE8]/25`}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 dark:bg-crm-border" />
    </div>
  );
}
