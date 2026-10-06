import { useEffect } from "react";
import API, { getApiBase, getClientAuthToken } from "@/lib/api";
import { visibleInterval } from "@/lib/visibleInterval";
import { peekLastActionAt } from "@/lib/realActivityWatch";
import { armCheckoutAlert } from "@/lib/checkoutAlert";
import { startCsrEngagementWatch, takeEngagementSlice } from "@/lib/csrEngagement";
import { logoutSession } from "@/lib/session";
import toast from "react-hot-toast";

export const CSR_IDLE_RECHECK_KEY = "csr_idle_recheckin";

export function requestCsrIdlePermission(): void {
  armCheckoutAlert();
}

export function useCsrPresence() {
  useEffect(() => {
    let tabId = sessionStorage.getItem("crm_tab_id");
    if (!tabId) { tabId = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("crm_tab_id", tabId); }
    const openedAt = sessionStorage.getItem("crm_tab_opened") ?? new Date().toISOString();
    sessionStorage.setItem("crm_tab_opened", openedAt);

    const stopWatch = startCsrEngagementWatch();

    const sendHeartbeat = () => {
      const visible = document.visibilityState === "visible";
      const slice = takeEngagementSlice();
      API.post("/csr/heartbeat", {
        userAgent: navigator.userAgent,
        tabId,
        openedAt,
        tabVisible: visible,
        hiddenAt: visible ? null : new Date().toISOString(),
        trackEngagement: true,
        activeMs: slice.activeMs,
        inactiveMs: slice.inactiveMs,
        ...(peekLastActionAt() ? { lastActionAt: peekLastActionAt() } : {}),
      }).then((res) => {
        if (!res.data?.shiftEnded) return;
        toast.error("CSR shift ended at 3:00 AM PKT. You can sign in again at 6:00 PM.", { duration: 8000 });
        void logoutSession(() => API.post("/auth/logout")).then(() => {
          window.location.replace("/");
        });
      }).catch(() => {});
    };

    const markOffline = () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getClientAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`${getApiBase()}/csr/offline`, {
        method: "POST", credentials: "include", keepalive: true,
        headers,
        body: JSON.stringify({ tabId }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const stopInterval = visibleInterval(sendHeartbeat, 60_000);

    const onVisibility = () => { sendHeartbeat(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", markOffline);

    return () => {
      stopWatch();
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", markOffline);
    };
  }, []);
}
