"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ACCOUNTS_HASH_SCROLL_OFFSET } from "../components/layout/headerOffset";

type ScrollFn = () => void;

const scrollListeners = new Set<ScrollFn>();
let historyPatched = false;
let origPush: History["pushState"] | null = null;
let origReplace: History["replaceState"] | null = null;

function fireScrollListeners() {
  scrollListeners.forEach(fn => fn());
}

function ensureHistoryPatch() {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;
  origPush = history.pushState.bind(history);
  origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    const ret = origPush!(...args);
    fireScrollListeners();
    return ret;
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    const ret = origReplace!(...args);
    fireScrollListeners();
    return ret;
  };
}

/**
 * Scroll to `window.location.hash` after navigation / hash change.
 * `ready` — wait until page data finished loading so the section exists in DOM.
 * `offset` — clear fixed accounts top bar + padding.
 */
export function useScrollToHash(ready = true, offset = ACCOUNTS_HASH_SCROLL_OFFSET) {
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;

    ensureHistoryPatch();

    const scrollToHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const el = document.getElementById(hash);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    };

    scrollListeners.add(scrollToHash);
    window.addEventListener("hashchange", scrollToHash);
    window.addEventListener("popstate", scrollToHash);

    const timers = [80, 320, 700].map(ms => window.setTimeout(scrollToHash, ms));

    return () => {
      scrollListeners.delete(scrollToHash);
      window.removeEventListener("hashchange", scrollToHash);
      window.removeEventListener("popstate", scrollToHash);
      timers.forEach(t => window.clearTimeout(t));
    };
  }, [pathname, ready, offset]);
}
