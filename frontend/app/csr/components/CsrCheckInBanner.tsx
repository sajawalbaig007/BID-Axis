"use client";

import { useCallback, useEffect, useState } from "react";
import { LogIn, X } from "lucide-react";
import API from "@/lib/api";
import { CSR_IDLE_RECHECK_KEY } from "@/app/csr/hooks/useCsrPresence";
import { CSR_PAGE_GUTTER } from "./shared/csrTableStyles";

function readIdleRecheck() {
  try {
    return sessionStorage.getItem(CSR_IDLE_RECHECK_KEY) === "1";
  } catch {
    return false;
  }
}

function clearIdleRecheck() {
  try {
    sessionStorage.removeItem(CSR_IDLE_RECHECK_KEY);
  } catch {
    /* ignore */
  }
}

/** Reminder until CSR checks in — Check In button lives in the top navbar. */
export default function CsrCheckInBanner() {
  const idleOnLoad = readIdleRecheck();
  const [needsCheckIn, setNeedsCheckIn] = useState(idleOnLoad);
  const [mustRecheck, setMustRecheck] = useState(idleOnLoad);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await API.get("/csr/work-session");
      const inNow = !!res.data.checkedIn;
      setNeedsCheckIn(!inNow);
      if (inNow) {
        setDismissed(false);
        setMustRecheck(false);
        clearIdleRecheck();
      } else if (readIdleRecheck()) {
        setMustRecheck(true);
        setDismissed(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onCheckedIn = (e: Event) => {
      const detail = (e as CustomEvent<{ checkedIn?: boolean; idle?: boolean }>).detail;
      if (detail && typeof detail.checkedIn === "boolean") {
        setNeedsCheckIn(!detail.checkedIn);
        if (detail.checkedIn) {
          setDismissed(false);
          setMustRecheck(false);
          clearIdleRecheck();
        } else if (detail.idle) {
          setMustRecheck(true);
          setDismissed(false);
        }
        return;
      }
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("csr-checkin-changed", onCheckedIn);
    const id = window.setInterval(() => void refresh(), 45_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("csr-checkin-changed", onCheckedIn);
      window.clearInterval(id);
    };
  }, [refresh]);

  if (!needsCheckIn || (dismissed && !mustRecheck)) return null;

  return (
    <div className="border-b border-amber-200/80 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 px-3 sm:px-4 py-2.5">
      <div className={`${CSR_PAGE_GUTTER} flex flex-wrap items-center justify-between gap-2`}>
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <LogIn size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
              {mustRecheck ? "You have to check in again" : "Check in to start your shift"}
            </p>
            <p className="text-[11px] sm:text-xs text-amber-800/80 dark:text-amber-300/80">
              {mustRecheck
                ? "There was no click, typing, or scroll for 5 minutes, so you were checked out. Use Check In in the top bar. This stays until you check in."
                : <>Use the green <span className="font-semibold">Check In</span> button in the top bar. Only <span className="font-semibold">Check Out</span> ends your shift — logout does not.</>}
            </p>
          </div>
        </div>
        {!mustRecheck && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="w-8 h-8 rounded-lg text-amber-700/70 dark:text-amber-300/70 hover:bg-amber-100 dark:hover:bg-amber-500/20 flex items-center justify-center shrink-0"
            title="Dismiss for now"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
