"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import API from "./api";
import { logoutSession } from "./session";
import { visibleInterval } from "./visibleInterval";
import { subscribeChatSocket, forceDisconnectChatSocket, type ChatSocketEvent } from "./chatSocket";

const STORAGE_KEY = "crm_login_attempt_ack";
const POLL_MS = 10_000;

function showLoginAttemptToast(attemptId: number, message?: string) {
  toast.error(
    message ?? "Someone is trying to login to your account from another device.",
    { duration: 10_000, id: `login-attempt-${attemptId}` },
  );
  void API.post("/auth/session-alert/ack").catch(() => {});
}

export function useSessionNotifier() {
  const notifiedRef = useRef(0);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) notifiedRef.current = parseInt(stored, 10) || 0;

    const maybeNotify = (attemptId: number, message?: string) => {
      if (typeof attemptId !== "number" || attemptId <= notifiedRef.current) return;
      notifiedRef.current = attemptId;
      sessionStorage.setItem(STORAGE_KEY, String(attemptId));
      showLoginAttemptToast(attemptId, message);
    };

    const check = async () => {
      try {
        const res = await API.get("/auth/session-status");
        const { loginAttemptPending, attemptId, message } = res.data ?? {};
        if (loginAttemptPending && typeof attemptId === "number") {
          maybeNotify(attemptId, message);
        }
      } catch {
        /* not logged in or network error */
      }
    };

    const onSocket = (ev: ChatSocketEvent) => {
      if (ev.type === "auth:force_logout") {
        forceDisconnectChatSocket();
        toast.error(ev.message ?? "You were logged out from all devices.", {
          duration: 4000,
          id: "auth-force-logout",
        });
        void logoutSession(async () => {});
        setTimeout(() => { window.location.href = "/"; }, 800);
        return;
      }
      if (ev.type !== "auth:login_attempt") return;
      maybeNotify(ev.attemptId, ev.message);
    };

    void check();
    const unsubPoll = visibleInterval(check, POLL_MS);
    const unsubSock = subscribeChatSocket(onSocket);
    return () => {
      unsubPoll();
      unsubSock();
    };
  }, []);
}
