"use client";

import { useEffect, useState } from "react";
import { getAuthMe, peekAuthMe } from "@/lib/authMeCache";

/** Whether the signed-in user may use staff chat (default true if unknown). */
export function useChatEnabled(): boolean {
  const peek = peekAuthMe();
  const [enabled, setEnabled] = useState(peek?.chatEnabled !== false);

  useEffect(() => {
    let cancelled = false;
    const sync = (force = false) => {
      void getAuthMe(force).then(u => {
        if (!cancelled) setEnabled(u?.chatEnabled !== false);
      });
    };
    sync(true);
    // Admin may change this account while it is already signed in.
    // Force-refresh so both block and unblock apply without another login.
    const interval = window.setInterval(() => sync(true), 10_000);
    const onUpdate = () => sync(true);
    window.addEventListener("crm-auth-me-updated", onUpdate);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("crm-auth-me-updated", onUpdate);
    };
  }, []);

  return enabled;
}
