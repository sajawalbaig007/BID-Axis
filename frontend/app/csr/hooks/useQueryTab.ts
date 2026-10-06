import { useEffect } from "react";

export function useQueryTab<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  setTab: (tab: T) => void,
  ready = true,
) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (!tab || !validTabs.includes(tab as T)) return;

    setTab(tab as T);
    params.delete("tab");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [ready, setTab, validTabs]);
}
