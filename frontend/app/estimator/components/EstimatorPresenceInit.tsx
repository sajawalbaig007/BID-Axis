"use client";

import { useEffect } from "react";
import API, { getApiBase, getClientAuthToken } from "@/lib/api";
import { visibleInterval } from "@/lib/visibleInterval";
import { peekLastActionAt } from "@/lib/realActivityWatch";
import { armCheckoutAlert } from "@/lib/checkoutAlert";

export const ESTIMATOR_IDLE_RECHECK_KEY = "estimator_idle_recheckin";

export function requestEstimatorIdlePermission(): void {
  armCheckoutAlert();
}

/** Heartbeat ticks the open work session after check-in. */
export function useEstimatorPresence() {
  useEffect(() => {
    let tabId = sessionStorage.getItem("crm_tab_id");
    if (!tabId) {
      tabId = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem("crm_tab_id", tabId);
    }
    const openedAt = sessionStorage.getItem("crm_tab_opened") ?? new Date().toISOString();
    sessionStorage.setItem("crm_tab_opened", openedAt);

    const sendHeartbeat = () => {
      const visible = document.visibilityState === "visible";
      API.post("/estimator/heartbeat", {
        userAgent: navigator.userAgent,
        tabId,
        openedAt,
        tabVisible: visible,
        hiddenAt: visible ? null : new Date().toISOString(),
        ...(peekLastActionAt() ? { lastActionAt: peekLastActionAt() } : {}),
      }).catch(() => {});
    };

    const markOffline = () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getClientAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`${getApiBase()}/estimator/offline`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers,
        body: JSON.stringify({ tabId }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const stopInterval = visibleInterval(sendHeartbeat, 60_000);

    const onVisibility = () => {
      sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", markOffline);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", markOffline);
    };
  }, []);
}

export default function EstimatorPresenceInit() {
  useEstimatorPresence();
  return null;
}
